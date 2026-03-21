import LoginClient from "./login-client";

export default async function LoginPage() {
  // The login page must always render — even before activation.
  // During the pre-activation flow, users sign in via Azure AD first,
  // then are redirected to /activate to enter the activation code.
  return <LoginClient ssoEnabled={!!process.env.AZURE_AD_CLIENT_ID} />;
}
