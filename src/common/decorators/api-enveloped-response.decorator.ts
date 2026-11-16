import { applyDecorators, Type } from "@nestjs/common";
import { ApiExtraModels, ApiResponse, getSchemaPath } from "@nestjs/swagger";
import { SwaggerResponseDto } from "../dto/swagger-response.dto";

type PrimitiveConstructor = StringConstructor | NumberConstructor | BooleanConstructor;
type ResponseModel = Type<unknown> | PrimitiveConstructor;

const primitiveTypeMap = new Map<PrimitiveConstructor, "string" | "number" | "boolean">([
	[String, "string"],
	[Number, "number"],
	[Boolean, "boolean"],
]);

const isPrimitiveModel = (value: ResponseModel): value is PrimitiveConstructor =>
	value === String || value === Number || value === Boolean;

export const ApiEnvelopedResponse = <TModel extends ResponseModel>(
	model?: TModel,
	options: { status?: number; description?: string; isArray?: boolean } = {},
) => {
	const status = options.status || 200;
	const description = options.description || "Success";
	const isArray = options.isArray || false;

	let dataSchema: Record<string, unknown>;
	if (model) {
		if (isPrimitiveModel(model)) {
			const primitiveType = primitiveTypeMap.get(model);
			dataSchema = isArray ? { type: "array", items: { type: primitiveType } } : { type: primitiveType };
		} else {
			dataSchema = isArray ? { type: "array", items: { $ref: getSchemaPath(model) } } : { $ref: getSchemaPath(model) };
		}
	} else {
		dataSchema = { type: "object" };
	}

	return applyDecorators(
		ApiExtraModels(SwaggerResponseDto, ...(model && !isPrimitiveModel(model) ? [model] : [])),
		ApiResponse({
			status,
			description,
			schema: {
				allOf: [
					{ $ref: getSchemaPath(SwaggerResponseDto) },
					{
						properties: {
							data: dataSchema,
						},
					},
				],
			},
		}),
	);
};
