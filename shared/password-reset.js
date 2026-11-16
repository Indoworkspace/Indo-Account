import {Api} from './api-client.js?v=20261116-buttons2';

export const PasswordReset={
  request:identifier=>Api.requestPasswordReset(identifier),
  verify:(identifier,code)=>Api.verifyPasswordReset(identifier,code),
  reset:(resetToken,password)=>Api.completePasswordReset(resetToken,password)
};
