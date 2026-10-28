import { ApiProperty } from "@nestjs/swagger";

export class SwaggerResponseDto<T> {
	@ApiProperty()
	status!: number;

	@ApiProperty()
	success!: boolean;

	@ApiProperty({ required: false })
	message?: string;

	data?: T;
}
