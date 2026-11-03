'use client'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md p-8">
        <h1 className="text-4xl font-bold mb-8 text-gray-900">Política de Privacidade</h1>
        
        <p className="text-gray-600 mb-6">
          <strong>Data de Última Atualização:</strong> Novembro de 2026
        </p>

        <div className="space-y-8">
          {/* Seção 1 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">1. Introdução</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Bem-vindo à nossa plataforma de gerenciamento de Jiu-Jitsu. Nós nos comprometemos em proteger sua privacidade e garantir que você tenha uma experiência positiva em nossa plataforma.
            </p>
            <p className="text-gray-700 leading-relaxed">
              Esta Política de Privacidade explica como coletamos, usamos, compartilhamos e protegemos suas informações pessoais quando você usa nossa aplicação web.
            </p>
          </section>

          {/* Seção 2 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">2. Informações que Coletamos</h2>
            <p className="text-gray-700 leading-relaxed mb-4">Coletamos as seguintes categorias de informações:</p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li><strong>Informações de Conta:</strong> Nome, email, senha (criptografada), número de telefone, foto de perfil</li>
              <li><strong>Informações de Perfil:</strong> Dados de professores e alunos, histórico de aulas, planos mensais</li>
              <li><strong>Conteúdo Gerado:</strong> Técnicas, módulos, vídeos, notas de aula, cronograma de aulas</li>
              <li><strong>Dados de Autenticação:</strong> Informações de login, sessões ativas, dados de OAuth do Google</li>
              <li><strong>Dados de Uso:</strong> Endereço IP, tipo de navegador, páginas visitadas, duração da sessão, ações realizadas</li>
              <li><strong>Dados de Armazenamento:</strong> Arquivos, imagens e documentos que você faz upload</li>
            </ul>
          </section>

          {/* Seção 3 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">3. Como Usamos Suas Informações</h2>
            <p className="text-gray-700 leading-relaxed mb-4">Usamos as informações coletadas para:</p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>Criar e manter sua conta</li>
              <li>Fornecer e melhorar nossos serviços</li>
              <li>Enviar comunicações relacionadas à sua conta (confirmação de email, recuperação de senha)</li>
              <li>Processar suas solicitações e transações</li>
              <li>Gerenciar relacionamentos entre professores e alunos</li>
              <li>Organizar e armazenar técnicas, vídeos e cronogramas</li>
              <li>Detectar, prevenir e resolver problemas técnicos e fraudes</li>
              <li>Cumprir obrigações legais</li>
            </ul>
          </section>

          {/* Seção 4 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">4. Compartilhamento de Dados</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Compartilhamos suas informações apenas nos seguintes casos:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li><strong>Com Alunos/Professores:</strong> Informações relevantes são compartilhadas conforme necessário para gerenciar aulas e planos</li>
              <li><strong>Prestadores de Serviço:</strong> Compartilhamos dados com fornecedores terceirizados que nos auxiliam:
                <ul className="list-circle list-inside space-y-1 text-gray-700 ml-4 mt-2">
                  <li><strong>Supabase:</strong> Banco de dados e autenticação</li>
                  <li><strong>Mux:</strong> Hospedagem e processamento de vídeos</li>
                  <li><strong>Resend:</strong> Envio de emails transacionais</li>
                  <li><strong>Google Cloud:</strong> Armazenamento e infraestrutura (incluindo Google Drive integrado)</li>
                </ul>
              </li>
              <li><strong>Requisição Legal:</strong> Se exigido por lei ou ordem judicial</li>
              <li><strong>Proteção de Direitos:</strong> Para proteger segurança, direitos ou propriedade</li>
            </ul>
          </section>

          {/* Seção 5 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">5. Retenção de Dados</h2>
            <p className="text-gray-700 leading-relaxed">
              Retemos suas informações pessoais enquanto sua conta estiver ativa ou conforme necessário para fornecer serviços. Você pode solicitar a exclusão de sua conta a qualquer momento. Dados arquivados podem ser retidos por fins de conformidade legal e auditoria.
            </p>
          </section>

          {/* Seção 6 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">6. Segurança de Dados</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Implementamos medidas de segurança técnicas, administrativas e físicas para proteger suas informações:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>Criptografia de dados em trânsito (HTTPS/TLS)</li>
              <li>Criptografia de dados sensíveis em repouso</li>
              <li>Autenticação segura com tokens JWT</li>
              <li>Políticas de Segurança em Nível de Linha (RLS) no banco de dados</li>
              <li>Acesso controlado e monitorado</li>
            </ul>
          </section>

          {/* Seção 7 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">7. Seus Direitos e Opções</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Você tem os seguintes direitos:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li><strong>Acesso:</strong> Solicitar uma cópia de seus dados pessoais</li>
              <li><strong>Correção:</strong> Solicitar correção de dados imprecisos</li>
              <li><strong>Exclusão:</strong> Solicitar a exclusão de sua conta e dados (sujeito a obrigações legais)</li>
              <li><strong>Portabilidade:</strong> Solicitar uma cópia de seus dados em formato portável</li>
              <li><strong>Opção de Não Rastreamento:</strong> Você pode desativar cookies em seu navegador</li>
            </ul>
          </section>

          {/* Seção 8 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">8. Cookies e Tecnologias de Rastreamento</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Usamos cookies e tecnologias similares para:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>Manter você conectado</li>
              <li>Lembrar suas preferências</li>
              <li>Analisar o uso do site para melhoria</li>
              <li>Prevenir fraudes</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              Você pode controlar cookies através das configurações do seu navegador.
            </p>
          </section>

          {/* Seção 9 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">9. Consentimento de Menores</h2>
            <p className="text-gray-700 leading-relaxed">
              Nossa plataforma não é intencionalmente destinada a menores de 13 anos. Se descobrirmos que coletamos dados de menores sem consentimento apropriado, tomaremos medidas para excluir tais informações.
            </p>
          </section>

          {/* Seção 10 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">10. Alterações a esta Política</h2>
            <p className="text-gray-700 leading-relaxed">
              Podemos atualizar esta Política de Privacidade periodicamente. Notificaremos você sobre mudanças significativas por email ou através de um aviso em nosso site. Sua continuação do uso implica aceitação das alterações.
            </p>
          </section>

          {/* Seção 11 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">11. Conformidade com Regulações</h2>
            <p className="text-gray-700 leading-relaxed">
              Nos esforçamos para estar em conformidade com regulações de privacidade aplicáveis, incluindo LGPD (Lei Geral de Proteção de Dados) no Brasil e GDPR na Europa.
            </p>
          </section>

          {/* Seção 12 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">12. Contato</h2>
            <p className="text-gray-700 leading-relaxed">
              Se você tiver dúvidas, preocupações ou desejar exercer seus direitos de privacidade, entre em contato conosco:
            </p>
            <div className="bg-gray-100 p-4 rounded mt-4">
              <p className="text-gray-700 mb-2"><strong>Email:</strong> privacy@jiu-jitsu-platform.com</p>
              <p className="text-gray-700"><strong>Endereço:</strong> [Seu endereço completo aqui]</p>
            </div>
          </section>

          {/* Seção 13 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">13. Responsável de Dados</h2>
            <p className="text-gray-700 leading-relaxed">
              Para fins de LGPD e GDPR, o responsável pelo tratamento de seus dados é nossa organização. Você pode contatar nosso Data Protection Officer através do email acima.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <p className="text-gray-600 text-sm">
            © 2026 Plataforma de Gerenciamento de Jiu-Jitsu. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  )
}
