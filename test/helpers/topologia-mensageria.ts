import { CreateTopicCommand, SNSClient, SubscribeCommand } from "@aws-sdk/client-sns";
import {
	CreateQueueCommand,
	DeleteMessageCommand,
	GetQueueAttributesCommand,
	ReceiveMessageCommand,
	SQSClient,
} from "@aws-sdk/client-sqs";
import type { EnvelopeMensagem } from "../../src/modules/mensageria/envelope";

async function fila(sqs: SQSClient, nome: string): Promise<{ url: string; arn: string }> {
	const url = (await sqs.send(new CreateQueueCommand({ QueueName: nome, Attributes: { VisibilityTimeout: "60" } }))).QueueUrl!;
	const arn = (await sqs.send(new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ["QueueArn"] }))).Attributes!.QueueArn!;
	return { url, arn };
}

/** Mesma assinatura da produção: raw delivery + filtro por origem nos MessageAttributes. */
export async function criarTopologia(ambiente: string) {
	const sqs = new SQSClient({});
	const sns = new SNSClient({});
	const comandos = await fila(sqs, `oficina-${ambiente}-execucao-comandos`);
	const orquestrador = await fila(sqs, `oficina-${ambiente}-os-orquestrador-eventos`);
	const topicoArn = (await sns.send(new CreateTopicCommand({ Name: `oficina-${ambiente}-eventos` }))).TopicArn!;
	await sns.send(
		new SubscribeCommand({
			TopicArn: topicoArn,
			Protocol: "sqs",
			Endpoint: orquestrador.arn,
			Attributes: {
				RawMessageDelivery: "true",
				FilterPolicy: JSON.stringify({ origem: ["billing", "execution"] }),
				FilterPolicyScope: "MessageAttributes",
			},
		}),
	);
	return { comandosUrl: comandos.url, orquestradorUrl: orquestrador.url, topicoArn };
}

export async function receberTodas(url: string, esperadas: number, timeoutMs = 15_000) {
	const sqs = new SQSClient({});
	const recebidas: { corpo: EnvelopeMensagem; atributos: Record<string, string> }[] = [];
	const limite = Date.now() + timeoutMs;
	while (recebidas.length < esperadas && Date.now() < limite) {
		const r = await sqs.send(
			new ReceiveMessageCommand({ QueueUrl: url, MaxNumberOfMessages: 10, WaitTimeSeconds: 1, MessageAttributeNames: ["All"] }),
		);
		for (const m of r.Messages ?? []) {
			const atributos = Object.fromEntries(Object.entries(m.MessageAttributes ?? {}).map(([k, v]) => [k, v.StringValue ?? ""]));
			recebidas.push({ corpo: JSON.parse(m.Body!) as EnvelopeMensagem, atributos });
			await sqs.send(new DeleteMessageCommand({ QueueUrl: url, ReceiptHandle: m.ReceiptHandle }));
		}
	}
	return recebidas;
}
