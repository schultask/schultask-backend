import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';

// 'admin' is deliberately not an allowed value here — inviting a user is a
// mutating action gated by `user:invite`, and letting it also mint admins
// would make that permission equivalent to full org takeover.
export class InviteUserDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn(['manager', 'learner'])
  role!: 'manager' | 'learner';
}
