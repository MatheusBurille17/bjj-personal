const MESSAGES: Record<string, string> = {
  access_denied:
    "Você recusou a autorização do Google. Tente novamente se quiser continuar com o Google.",
  authorization_pending:
    "A autorização do Google ainda está pendente. Tente novamente.",
  configuration_error:
    "O login com Google não está configurado neste ambiente. Use e-mail e senha ou contate o suporte.",
  email_already_exists:
    "Este e-mail já está vinculado a outra conta Google. Entre com a conta correta.",
  email_mismatch_on_connect:
    "O e-mail da conta Google não corresponde ao e-mail da sua conta. Entre com a conta Google correta.",
  forbidden:
    "Sua conta ainda não possui um vínculo ativo. Aceite o convite do seu professor para acessar o portal.",
  https_required: "Conexão insegura. Acesse a plataforma usando HTTPS.",
  invalid_client: "A configuração do cliente Google é inválida. Contate o suporte.",
  invalid_code:
    "O código de autorização do Google é inválido ou expirou. Comece novamente.",
  invalid_grant:
    "Sua conexão com o Google expirou ou foi revogada. Reconecte sua conta Google.",
  invalid_request: "A solicitação de autenticação Google é inválida. Comece novamente.",
  invalid_scope: "Uma permissão solicitada ao Google é inválida. Contate o suporte.",
  network_error: "Erro de conexão. Verifique sua internet e tente novamente.",
  not_found: "Nenhuma conta Google conectada.",
  rate_limited: "Muitas tentativas. Aguarde um minuto e tente novamente.",
  revocation_failed:
    "Não foi possível revogar a autorização no Google. Tente novamente.",
  server_error: "O Google encontrou um erro. Tente novamente mais tarde.",
  state_expired: "Sua sessão de autenticação expirou. Comece novamente.",
  state_mismatch: "Solicitação de autenticação inválida. Comece novamente.",
  state_not_found: "Solicitação de autenticação inválida. Comece novamente.",
  token_refresh_failed:
    "Sua conexão com o Google expirou. Reconecte sua conta Google.",
  token_storage_failed:
    "Não foi possível salvar os tokens do Google. Tente conectar novamente.",
  unauthorized: "Sua sessão expirou. Entre novamente.",
};

export function googleErrorMessage(code: string | null | undefined): string {
  if (!code) {
    return "Ocorreu um erro durante a autenticação com o Google. Tente novamente.";
  }
  return (
    MESSAGES[code] ??
    "Ocorreu um erro durante a autenticação com o Google. Tente novamente."
  );
}
