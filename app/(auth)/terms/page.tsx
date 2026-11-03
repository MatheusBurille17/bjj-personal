'use client'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md p-8">
        <h1 className="text-4xl font-bold mb-8 text-gray-900">Termos de Serviço</h1>
        
        <p className="text-gray-600 mb-6">
          <strong>Data de Última Atualização:</strong> Novembro de 2026
        </p>

        <div className="space-y-8">
          {/* Seção 1 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">1. Aceição dos Termos</h2>
            <p className="text-gray-700 leading-relaxed">
              Ao acessar e usar esta plataforma, você aceita estar vinculado por estes Termos de Serviço. Se você não concorda com qualquer parte destes termos, não deve usar a plataforma.
            </p>
          </section>

          {/* Seção 2 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">2. Descrição do Serviço</h2>
            <p className="text-gray-700 leading-relaxed">
              Nossa plataforma fornece ferramentas para instrutores de Jiu-Jitsu gerenciarem alunos, cronogramas, planos de treinamento, técnicas e vídeos. O serviço é fornecido "como está" e "conforme disponível".
            </p>
          </section>

          {/* Seção 3 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">3. Elegibilidade</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Para usar nossa plataforma, você deve:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>Ter pelo menos 18 anos de idade</li>
              <li>Ter autoridade legal para aceitar estes termos</li>
              <li>Não violar nenhuma lei ou regulamento aplicável</li>
              <li>Concordar em fornecer informações precisas e atualizadas</li>
            </ul>
          </section>

          {/* Seção 4 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">4. Criação de Conta</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Você é responsável por:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>Manter a confidencialidade de suas credenciais</li>
              <li>Todas as atividades que ocorrem em sua conta</li>
              <li>Notificar-nos imediatamente de uso não autorizado</li>
              <li>Fornecer informações precisas e completas</li>
            </ul>
          </section>

          {/* Seção 5 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">5. Uso Aceitável</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Você concorda em não:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>Violar direitos de propriedade intelectual</li>
              <li>Transmitir malware ou conteúdo prejudicial</li>
              <li>Harassment, intimidação ou abuso de outros usuários</li>
              <li>Tentar ganhar acesso não autorizado</li>
              <li>Usar a plataforma para fins ilegais</li>
              <li>Coletar dados sem autorização</li>
              <li>Interferir com a operação da plataforma</li>
            </ul>
          </section>

          {/* Seção 6 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">6. Conteúdo do Usuário</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Você retém todos os direitos sobre o conteúdo que você criar (técnicas, vídeos, notas). Ao fazer upload, você nos concede licença para armazenar, processar e exibir seu conteúdo conforme necessário para fornecer o serviço.
            </p>
            <p className="text-gray-700 leading-relaxed">
              Você garante que possui direitos para todo o conteúdo que enviar e que não viola direitos de terceiros.
            </p>
          </section>

          {/* Seção 7 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">7. Propriedade Intelectual</h2>
            <p className="text-gray-700 leading-relaxed">
              A plataforma, incluindo seu design, funcionalidade e conteúdo (exceto conteúdo do usuário), é nossa propriedade intelectual. Você recebe uma licença limitada para usar a plataforma conforme permitido por estes termos.
            </p>
          </section>

          {/* Seção 8 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">8. Isenção de Garantias</h2>
            <p className="text-gray-700 leading-relaxed">
              A PLATAFORMA É FORNECIDA "COMO ESTÁ" SEM GARANTIAS, EXPRESSAS OU IMPLÍCITAS. NÃO GARANTIMOS QUE A PLATAFORMA SERÁ ININTERRUPTA, SEGURA OU LIVRE DE ERROS.
            </p>
          </section>

          {/* Seção 9 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">9. Limitação de Responsabilidade</h2>
            <p className="text-gray-700 leading-relaxed">
              NA MÁXIMA EXTENSÃO PERMITIDA POR LEI, NÃO SEREMOS RESPONSÁVEIS POR DANOS INDIRETOS, INCIDENTAIS, ESPECIAIS, CONSEQUENTES OU PUNITIVOS.
            </p>
          </section>

          {/* Seção 10 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">10. Interrupção do Serviço</h2>
            <p className="text-gray-700 leading-relaxed">
              Podemos interromper ou encerrar o serviço a qualquer momento, com ou sem aviso, por qualquer motivo, incluindo violação destes termos.
            </p>
          </section>

          {/* Seção 11 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">11. Indenização</h2>
            <p className="text-gray-700 leading-relaxed">
              Você concorda em indenizar, defender e manter-nos inofensos de qualquer reclamação, dano ou custo decorrente de seu uso da plataforma ou violação destes termos.
            </p>
          </section>

          {/* Seção 12 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">12. Links para Terceiros</h2>
            <p className="text-gray-700 leading-relaxed">
              Nossa plataforma pode conter links para sites de terceiros. Não somos responsáveis pelo conteúdo ou políticas desses sites. Use-os por sua conta e risco.
            </p>
          </section>

          {/* Seção 13 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">13. Alterações aos Termos</h2>
            <p className="text-gray-700 leading-relaxed">
              Podemos atualizar estes termos a qualquer momento. Alterações significativas serão comunicadas por email. Seu uso continuado implica aceitação dos termos alterados.
            </p>
          </section>

          {/* Seção 14 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">14. Lei Aplicável</h2>
            <p className="text-gray-700 leading-relaxed">
              Estes termos são regidos pelas leis brasileiras. Qualquer disputa será submetida aos tribunais competentes.
            </p>
          </section>

          {/* Seção 15 */}
          <section>
            <h2 className="text-2xl font-bold mb-4 text-gray-900">15. Contato</h2>
            <p className="text-gray-700 leading-relaxed">
              Para questões sobre estes termos, entre em contato conosco em:
            </p>
            <div className="bg-gray-100 p-4 rounded mt-4">
              <p className="text-gray-700"><strong>Email:</strong> support@jiu-jitsu-platform.com</p>
            </div>
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
