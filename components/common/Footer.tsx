'use client'

import Link from 'next/link'

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Coluna 1: Sobre */}
          <div>
            <h3 className="text-white font-bold mb-4">Sobre</h3>
            <p className="text-sm leading-relaxed">
              Plataforma de gerenciamento de treinamento de Jiu-Jitsu para instrutores e alunos.
            </p>
          </div>

          {/* Coluna 2: Links Rápidos */}
          <div>
            <h3 className="text-white font-bold mb-4">Links Úteis</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  Política de Privacidade
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  Termos de Serviço
                </Link>
              </li>
              <li>
                <a 
                  href="https://policies.google.com/privacy?hl=pt-BR" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  Política de Privacidade do Google
                </a>
              </li>
            </ul>
          </div>

          {/* Coluna 3: Contato */}
          <div>
            <h3 className="text-white font-bold mb-4">Contato</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="mailto:privacy@jiu-jitsu-platform.com" className="hover:text-white transition-colors">
                  privacy@jiu-jitsu-platform.com
                </a>
              </li>
              <li className="text-xs text-gray-400 mt-4">
                Para questões de privacidade, entre em contato conosco.
              </li>
            </ul>
          </div>
        </div>

        {/* Divisor */}
        <div className="border-t border-gray-700 pt-8">
          <p className="text-sm text-center text-gray-400">
            © {currentYear} Plataforma de Gerenciamento de Jiu-Jitsu. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  )
}
