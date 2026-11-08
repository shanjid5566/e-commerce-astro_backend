import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator";
import { Transform } from "class-transformer";


/**
 * LoginDto defines and validates the expected login payload.
 */
export class LoginDto {
  // Validates standard email format and ensures it's not empty
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  // Automatically trim whitespace and convert to lowercase
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  email: string;
  // Validates password string and minimum length
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;
}