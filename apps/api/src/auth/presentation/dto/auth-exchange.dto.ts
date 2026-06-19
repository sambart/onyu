import { IsNotEmpty, IsString } from 'class-validator';

export class AuthExchangeDto {
  @IsString()
  @IsNotEmpty()
  code: string;
}
