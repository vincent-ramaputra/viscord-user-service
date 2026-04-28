export class UpdateUsernameDTO {
  username: string;

  validate(): string | undefined {
    if (this.username.split(' ').length > 1) {
      return 'Username must not contain any spaces';
    }

    if (this.username.match(/[^A-Za-z0-9]/)) {
      return 'Username must not contain special characters';
    }
  }
}
