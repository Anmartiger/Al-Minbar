import { useEffect, useState } from 'react';
import { EmptyState, Skeleton } from '../components/ui';
import { useT } from '../lib/i18n';
import { queryContent } from '../lib/content';

type Attribution = {
  key: string; title: string; source: string; license: string; notice: string | null;
};

/**
 * §4.2: "every bundled text keeps its licence and source attribution in an in-app
 * 'About the data' screen. This is required, not optional."
 *
 * Read from the database rather than hard-coded, so a rebuild from new sources
 * updates the credits with them.
 */
export default function About() {
  const { t } = useT();
  const [rows, setRows] = useState<Attribution[] | null>(null);
  const [facts, setFacts] = useState<Record<string, string>>({});

  useEffect(() => {
    queryContent<Attribution>(
      'SELECT key, title, source, license, notice FROM attributions ORDER BY title')
      .then(setRows).catch(() => setRows([]));
    queryContent<{ key: string; value: string }>('SELECT key, value FROM meta')
      .then(m => setFacts(Object.fromEntries(m.map(r => [r.key, r.value]))))
      .catch(() => {});
  }, []);

  if (!rows) return <Skeleton height={200} />;
  if (!rows.length) {
    return <EmptyState title={t('quran.notInstalled')} body={t('quran.notInstalledBody')} />;
  }

  return (
    <section className="settings-section about">
      <h2>{t('about.title')}</h2>
      <p className="settings-note">{t('about.intro')}</p>

      {facts.verse_count && (
        <p className="about-facts">
          {t('about.verses', { count: facts.verse_count })} ·{' '}
          {t('about.adhkar', { count: facts.athkar_count ?? '0' })}
          {facts.uthmani_sha256 && (
            <>
              <br />
              <span className="about-checksum">
                {t('about.checksum')} {facts.uthmani_sha256.slice(0, 16)}…
              </span>
            </>
          )}
        </p>
      )}

      {rows.map(r => (
        <article className="about-entry frame" key={r.key}>
          <h3>{r.title}</h3>
          <dl>
            <dt>{t('about.source')}</dt><dd>{r.source}</dd>
            <dt>{t('about.licence')}</dt><dd>{r.license}</dd>
          </dl>
          {r.notice && <pre className="about-notice">{r.notice}</pre>}
        </article>
      ))}

      {/* §4.2 asks the screen to note the 14-vs-15 sajda difference explicitly. */}
      <p className="settings-note">{t('about.sajdaNote')}</p>
      <p className="settings-note">{t('about.athkarNote')}</p>
    </section>
  );
}
