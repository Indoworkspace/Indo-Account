import {Api} from './api-client.js?v=20261117-eyemail1';

export const PasswordReset={
  request:identifier=>Api.requestPasswordReset(identifier),
  verify:(identifier,code)=>Api.verifyPasswordReset(identifier,code),
  reset:(resetToken,password)=>Api.completePasswordReset(resetToken,password)
};
