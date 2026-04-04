import {
  ChevronRight,
  ExternalLink,
  Mic,
  Music,
  Settings,
  Shield,
  TrendingUp,
  UserPlus,
  Zap,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';

const BOT_PERMISSIONS = 411108370;

function getInviteUrl(): string | null {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) return null;
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${BOT_PERMISSIONS}&scope=bot+applications.commands`;
}

export default async function Home() {
  const t = await getTranslations('landing');
  const inviteUrl = getInviteUrl();

  return (
    <div className="bg-gradient-to-b from-white to-gray-50">
      {/* 히어로 섹션 */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 text-center">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 mb-6">Onyu</h1>

          <p className="text-xl text-gray-600 mb-8">{t('hero.description')}</p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {inviteUrl && (
              <a
                href={inviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold text-lg"
              >
                {t('hero.cta.invite')}
                <ExternalLink className="w-5 h-5" />
              </a>
            )}
            <a
              href="#features"
              className={`px-8 py-4 rounded-lg font-semibold text-lg transition-colors ${
                inviteUrl
                  ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {t('hero.cta.features')}
            </a>
          </div>
        </div>
      </section>

      {/* 주요 기능 섹션 */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">{t('features.sectionTitle')}</h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
              <TrendingUp className="w-6 h-6 text-indigo-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {t('features.voiceStats.title')}
            </h3>
            <p className="text-gray-600">{t('features.voiceStats.description')}</p>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <Mic className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {t('features.autoChannel.title')}
            </h3>
            <p className="text-gray-600">{t('features.autoChannel.description')}</p>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center mb-4">
              <Music className="w-6 h-6 text-pink-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {t('features.music.title')}
            </h3>
            <p className="text-gray-600">{t('features.music.description')}</p>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {t('features.gemini.title')}
            </h3>
            <p className="text-gray-600">{t('features.gemini.description')}</p>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <UserPlus className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {t('features.newbie.title')}
            </h3>
            <p className="text-gray-600">{t('features.newbie.description')}</p>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mb-4">
              <Settings className="w-6 h-6 text-yellow-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {t('features.dashboard.title')}
            </h3>
            <p className="text-gray-600">{t('features.dashboard.description')}</p>
          </div>
        </div>
      </section>

      {/* 설정 가이드 섹션 */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 border-t border-gray-200">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">{t('setup.sectionTitle')}</h2>
          <p className="text-lg text-gray-600">{t('setup.sectionDescription')}</p>
        </div>

        <div className="max-w-3xl mx-auto space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold">
                1
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  {t('setup.step1.title')}
                </h3>
                <p className="text-gray-600">{t('setup.step1.description')}</p>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <ChevronRight className="w-6 h-6 text-gray-400 rotate-90" />
          </div>

          <div className="bg-amber-50 p-6 rounded-xl shadow-sm border border-amber-200">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 font-bold">
                2
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-semibold text-gray-900">{t('setup.step2.title')}</h3>
                  <Shield className="w-5 h-5 text-amber-600" />
                </div>
                <p className="text-gray-600 mb-3">{t('setup.step2.description')}</p>
                <div className="bg-white rounded-lg p-4 border border-amber-200">
                  <p className="text-sm font-medium text-gray-900 mb-2">{t('setup.step2.howTo')}</p>
                  <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                    <li>{t('setup.step2.step1')}</li>
                    <li>{t('setup.step2.step2')}</li>
                    <li>{t('setup.step2.step3')}</li>
                  </ol>
                  <p className="text-xs text-amber-700 mt-3">{t('setup.step2.notice')}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <ChevronRight className="w-6 h-6 text-gray-400 rotate-90" />
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-bold">
                3
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  {t('setup.step3.title')}
                </h3>
                <p className="text-gray-600">{t('setup.step3.description')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 푸터 */}
      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <span>Onyu</span>
          <div className="flex gap-6">
            <a href="/privacy" className="hover:text-gray-700 transition-colors">
              {t('footer.privacy')}
            </a>
            <a href="/terms" className="hover:text-gray-700 transition-colors">
              {t('footer.terms')}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
