import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Play, RotateCcw, Square, Trash2 } from 'lucide-react';
import {
  Button, List, ListRow, SegmentedControl, Skeleton, Slider, Switch,
} from '../components/ui';
import { useT, type Language, LANGUAGES } from '../lib/i18n';
import { ACCENTS, type Accent, type ThemeChoice } from '../design/theme';
import { BUNDLED_FAMILIES } from '../design/fonts.generated';
import {
  DEFAULT_TYPOGRAPHY, TYPOGRAPHY_CONTEXTS, applyTypography, isArabicFamily,
  loadTypography, saveTypography, type Typography, type TypographyContext,
} from '../design/typography';
import { formatBytes } from '../lib/recitation';
import { queryContent } from '../lib/content';
import About from './About';
import './Settings.css';

type Pane =
  | 'location' | 'prayerTimes' | 'notifications' | 'typography' | 'appearance'
  | 'language' | 'startup' | 'storage' | 'about';

const PANES: Pane[] = [
  'location', 'prayerTimes', 'notifications', 'typography', 'appearance',
  'language', 'startup', 'storage', 'about',
];

type AppSettings = Record<string, unknown> & {
  prayer: { method: { kind: string }; madhab: string; high_latitude_rule: string };
  notifications: { enabled: boolean; reminder_minutes: number };
  adhan: { enabled: boolean; volume: number; silent_for_fajr: boolean; sound: string; fajr_sound: string };
  startup: { autostart: boolean; tray_delay_seconds: number; close_to_quit: boolean; global_shortcut: string | null };
  tray_label_format: string;
  arabic_indic_digits: boolean;
  language: string;
  location: { city: string; country: string; timezone: string; latitude: number; longitude: number };
};

const METHODS = [
  'MuslimWorldLeague', 'Egyptian', 'UmmAlQura', 'Karachi', 'Isna', 'Tehran',
  'Jafari', 'Kuwait', 'Qatar', 'Singapore', 'Turkey', 'MoonsightingCommittee', 'Dubai',
];

export default function Settings({
  theme, accent, language, arabicIndic,
  onTheme, onAccent, onLanguage, onArabicIndic,
}: {
  theme: ThemeChoice; accent: Accent; language: Language; arabicIndic: boolean;
  onTheme: (t: ThemeChoice) => void;
  onAccent: (a: Accent) => void;
  onLanguage: (l: Language) => void;
  onArabicIndic: (v: boolean) => void;
}) {
  const { t } = useT();
  const [pane, setPane] = useState<Pane>('location');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [paths, setPaths] = useState<{ config: string; data: string; cache: string } | null>(null);
  const [cache, setCache] = useState<{ bytes: number; files: number } | null>(null);

  useEffect(() => {
    invoke<AppSettings>('get_settings').then(setSettings).catch(() => {});
    invoke<typeof paths>('storage_paths').then(setPaths).catch(() => {});
    invoke<{ bytes: number; files: number }>('audio_cache_stats').then(setCache).catch(() => {});
  }, []);

  const patch = async (mutate: (s: AppSettings) => void) => {
    if (!settings) return;
    const next = structuredClone(settings);
    mutate(next);
    setSettings(next);
    await invoke('set_settings', { settings: next }).catch(() => {});
  };

  return (
    <div className="settings">
      <nav className="settings-panes" aria-label={t('settings.title')}>
        {PANES.map(p => (
          <button key={p} className="settings-pane-link" aria-current={pane === p ? 'page' : undefined}
            onClick={() => setPane(p)}>
            {t(`settings.${p === 'about' ? 'about' : p}`)}
          </button>
        ))}
      </nav>

      <div className="settings-body">
        {pane === 'about' ? <About /> : !settings ? <Skeleton height={200} /> : (
          <>
            {pane === 'location' && (
              <Section title={t('settings.location')}>
                <List>
                  <ListRow title={settings.location.city || '—'}
                    subtitle={`${settings.location.country} · ${settings.location.timezone}`} />
                  <ListRow title="latitude" trailing={settings.location.latitude.toFixed(4)} />
                  <ListRow title="longitude" trailing={settings.location.longitude.toFixed(4)} />
                </List>
              </Section>
            )}

            {pane === 'prayerTimes' && (
              <Section title={t('settings.prayerTimes')}>
                <List>
                  <ListRow title={t('settings.method')} trailing={
                    <select className="settings-select" value={settings.prayer.method.kind}
                      onChange={e => patch(s => { s.prayer.method = { kind: e.target.value }; })}>
                      {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>} />
                  <ListRow title={t('settings.madhab')} trailing={
                    <SegmentedControl
                      options={[
                        { value: 'shafi', label: t('settings.shafi') },
                        { value: 'hanafi', label: t('settings.hanafi') },
                      ]}
                      value={settings.prayer.madhab}
                      onChange={v => patch(s => { s.prayer.madhab = v; })} />} />
                  <ListRow title={t('settings.highLatitude')} trailing={
                    <select className="settings-select" value={settings.prayer.high_latitude_rule}
                      onChange={e => patch(s => { s.prayer.high_latitude_rule = e.target.value; })}>
                      <option value="middle_of_the_night">{t('settings.middleOfTheNight')}</option>
                      <option value="seventh_of_the_night">{t('settings.seventhOfTheNight')}</option>
                      <option value="twilight_angle">{t('settings.twilightAngle')}</option>
                    </select>} />
                </List>
              </Section>
            )}

            {pane === 'notifications' && (
              <Section title={t('settings.notifications')}>
                <List>
                  <ListRow title={t('settings.enableNotifications')} trailing={
                    <Switch checked={settings.notifications.enabled} label={t('settings.enableNotifications')}
                      onChange={v => patch(s => { s.notifications.enabled = v; })} />} />
                  <ListRow title={t('settings.reminder')} trailing={
                    <select className="settings-select" value={settings.notifications.reminder_minutes}
                      onChange={e => patch(s => { s.notifications.reminder_minutes = Number(e.target.value); })}>
                      <option value={0}>{t('settings.reminderNone')}</option>
                      {[5, 10, 15, 20].map(m =>
                        <option key={m} value={m}>{t('settings.reminderMinutes', { count: m })}</option>)}
                    </select>} />
                  <ListRow title={t('settings.adhanEnabled')} trailing={
                    <Switch checked={settings.adhan.enabled} label={t('settings.adhanEnabled')}
                      onChange={v => patch(s => { s.adhan.enabled = v; })} />} />
                  <ListRow title={t('settings.silentFajr')} trailing={
                    <Switch checked={settings.adhan.silent_for_fajr} label={t('settings.silentFajr')}
                      onChange={v => patch(s => { s.adhan.silent_for_fajr = v; })} />} />
                  <ListRow title={t('settings.volume')} trailing={
                    <div style={{ inlineSize: 180 }}>
                      <Slider label={t('settings.volume')} min={0} max={100}
                        value={Math.round(settings.adhan.volume * 100)}
                        format={v => `${v}%`}
                        onChange={v => patch(s => { s.adhan.volume = v / 100; })} />
                    </div>} />
                  <ListRow title={t('settings.testPlay')} trailing={
                    <span style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <Button variant="tinted" size="sm"
                        onClick={() => invoke('play_adhan', { sound: null }).catch(() => {})}>
                        <Play size={13} strokeWidth={1.5} />{t('settings.testPlay')}
                      </Button>
                      <Button variant="plain" size="sm" onClick={() => invoke('stop_adhan')}>
                        <Square size={12} strokeWidth={1.5} />{t('settings.stop')}
                      </Button>
                    </span>} />
                </List>
              </Section>
            )}

            {pane === 'typography' && <TypographyPane />}

            {pane === 'appearance' && (
              <Section title={t('settings.appearance')}>
                <List>
                  <ListRow title={t('settings.theme')} trailing={
                    <SegmentedControl
                      options={[
                        { value: 'light' as const, label: t('settings.light') },
                        { value: 'dark' as const, label: t('settings.dark') },
                        { value: 'system' as const, label: t('settings.system') },
                      ]}
                      value={theme} onChange={onTheme} />} />
                  <ListRow title={t('settings.accent')} trailing={
                    <span className="settings-swatches">
                      {ACCENTS.map(a => (
                        <button key={a} className="settings-swatch" aria-label={a}
                          aria-pressed={accent === a} style={{ background: `var(--accent-${a})` }}
                          onClick={() => onAccent(a)} />
                      ))}
                    </span>} />
                  <ListRow title={t('settings.digits')} trailing={
                    <SegmentedControl
                      options={[
                        { value: 'arabic' as const, label: t('settings.arabicIndic') },
                        { value: 'western' as const, label: t('settings.western') },
                      ]}
                      value={arabicIndic ? 'arabic' : 'western'}
                      onChange={v => onArabicIndic(v === 'arabic')} />} />
                </List>
              </Section>
            )}

            {pane === 'language' && (
              <Section title={t('settings.language')}>
                <List>
                  <ListRow title={t('settings.interfaceLanguage')} trailing={
                    <SegmentedControl
                      options={LANGUAGES.map(l => ({ value: l, label: l === 'ar' ? 'العربية' : 'English' }))}
                      value={language} onChange={onLanguage} />} />
                </List>
              </Section>
            )}

            {pane === 'startup' && (
              <Section title={t('settings.startup')}>
                <List>
                  <ListRow title={t('settings.autostart')} trailing={
                    <Switch checked={settings.startup.autostart} label={t('settings.autostart')}
                      onChange={v => patch(s => { s.startup.autostart = v; })} />} />
                  <ListRow title={t('settings.closeToQuit')} trailing={
                    <Switch checked={settings.startup.close_to_quit} label={t('settings.closeToQuit')}
                      onChange={v => patch(s => { s.startup.close_to_quit = v; })} />} />
                  <ListRow title={t('settings.trayDelay')} trailing={
                    <div style={{ inlineSize: 180 }}>
                      <Slider label={t('settings.trayDelay')} min={0} max={60}
                        value={settings.startup.tray_delay_seconds}
                        format={v => t('settings.seconds', { count: v })}
                        onChange={v => patch(s => { s.startup.tray_delay_seconds = v; })} />
                    </div>} />
                  <ListRow title={t('settings.trayFormat')} trailing={
                    <select className="settings-select" value={settings.tray_label_format}
                      onChange={e => patch(s => { s.tray_label_format = e.target.value; })}>
                      <option value="name_and_countdown">{t('settings.labelNameCountdown')}</option>
                      <option value="name_and_time">{t('settings.labelNameTime')}</option>
                      <option value="countdown_only">{t('settings.labelCountdown')}</option>
                      <option value="icon_only">{t('settings.labelIcon')}</option>
                    </select>} />
                  <ListRow title={t('settings.shortcut')}
                    trailing={settings.startup.global_shortcut ?? t('common.off')} />
                </List>
              </Section>
            )}

            {pane === 'storage' && (
              <Section title={t('settings.storage')}>
                <List>
                  <ListRow title={t('settings.configDir')} subtitle={paths?.config} />
                  <ListRow title={t('settings.dataDir')} subtitle={paths?.data} />
                  <ListRow title={t('settings.cacheDir')} subtitle={paths?.cache}
                    trailing={cache ? t('settings.cacheSize', {
                      size: formatBytes(cache.bytes), files: cache.files,
                    }) : ''} />
                  <ListRow title={t('settings.clearCache')} trailing={
                    <Button variant="plain" size="sm" disabled={!cache?.files}
                      onClick={async () => {
                        await invoke('clear_audio_cache').catch(() => {});
                        setCache(await invoke('audio_cache_stats'));
                      }}>
                      <Trash2 size={13} strokeWidth={1.5} />{t('settings.clearCache')}
                    </Button>} />
                </List>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="settings-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/* ------------------------ §5.2 typography ------------------------------- */

/**
 * §5.2 wants font family, size, line-height and letter-spacing chosen
 * independently for three contexts, with a live preview showing real text, and
 * letter-spacing disabled for any Arabic face because it breaks the joins (§5.3).
 */
function TypographyPane() {
  const { t } = useT();
  const PREVIEW = usePreviews();
  const [typo, setTypo] = useState<Typography>(loadTypography);
  const [system, setSystem] = useState<{ families: string[]; fontconfigAvailable: boolean } | null>(null);

  useEffect(() => {
    invoke<{ families: string[]; fontconfigAvailable: boolean }>('system_fonts')
      .then(setSystem).catch(() => setSystem({ families: [], fontconfigAvailable: false }));
  }, []);

  useEffect(() => { applyTypography(typo); saveTypography(typo); }, [typo]);

  const update = (ctx: TypographyContext, patch: Partial<Typography[TypographyContext]>) =>
    setTypo(prev => ({ ...prev, [ctx]: { ...prev[ctx], ...patch } }));

  const bundled = useMemo(() => BUNDLED_FAMILIES.map(f => f.name), []);

  return (
    <Section title={t('settings.typography')}>
      {system && !system.fontconfigAvailable && (
        <p className="settings-note">{t('settings.noFontconfig')}</p>
      )}
      {TYPOGRAPHY_CONTEXTS.map(ctx => {
        const value = typo[ctx];
        const arabic = isArabicFamily(value.family);
        return (
          <div className="typo-block frame" key={ctx}>
            <div className="typo-head">
              <h3>{t(`settings.font${ctx[0].toUpperCase()}${ctx.slice(1)}`)}</h3>
              <Button variant="plain" size="sm"
                onClick={() => setTypo(p => ({ ...p, [ctx]: DEFAULT_TYPOGRAPHY[ctx] }))}>
                <RotateCcw size={12} strokeWidth={1.5} />{t('settings.reset')}
              </Button>
            </div>

            <List>
              <ListRow title={t('settings.family')} trailing={
                <select className="settings-select" value={value.family}
                  onChange={e => update(ctx, { family: e.target.value })}>
                  <optgroup label={t('settings.bundled')}>
                    {/* §5.2: each name is rendered in its own face. */}
                    {bundled.map(f => (
                      <option key={f} value={f} style={{ fontFamily: `'${f}'` }}>{f}</option>
                    ))}
                  </optgroup>
                  {system && system.families.length > 0 && (
                    <optgroup label={t('settings.systemFonts')}>
                      {system.families.map(f => (
                        <option key={f} value={f} style={{ fontFamily: `'${f}'` }}>{f}</option>
                      ))}
                    </optgroup>
                  )}
                </select>} />

              <ListRow title={t('settings.size')} trailing={
                <div style={{ inlineSize: 190 }}>
                  <Slider label={t('settings.size')} min={12} max={56} value={value.size}
                    format={v => `${v}px`} onChange={v => update(ctx, { size: v })} />
                </div>} />

              <ListRow title={t('settings.lineHeight')} trailing={
                <div style={{ inlineSize: 190 }}>
                  <Slider label={t('settings.lineHeight')}
                    // §5.3: never below 2.0 for Quran — tashkeel clips.
                    min={ctx === 'quran' ? 2 : 1.2} max={ctx === 'quran' ? 2.4 : 2.4}
                    step={0.05} value={value.lineHeight}
                    format={v => v.toFixed(2)} onChange={v => update(ctx, { lineHeight: v })} />
                </div>} />

              <ListRow
                title={t('settings.letterSpacing')}
                subtitle={arabic ? t('settings.letterSpacingArabic') : undefined}
                trailing={
                  <div style={{ inlineSize: 190 }}>
                    <Slider label={t('settings.letterSpacing')} min={-2} max={4} step={0.1}
                      value={arabic ? 0 : value.letterSpacing} disabled={arabic}
                      format={v => `${v.toFixed(1)}px`}
                      onChange={v => update(ctx, { letterSpacing: v })} />
                  </div>} />
            </List>

            {/* §5.2's live preview, with real text. */}
            <div className="typo-preview" lang="ar" dir="rtl" style={{
              fontFamily: `'${value.family}'`,
              fontSize: value.size,
              lineHeight: value.lineHeight,
              letterSpacing: arabic ? 'normal' : `${value.letterSpacing}px`,
            }}>
              {PREVIEW[ctx]}
            </div>
          </div>
        );
      })}
    </Section>
  );
}

/**
 * §5.2 wants the preview to show "real text [...] (بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
 * for Quran, a real dhikr for athkar)".
 *
 * Both are read from the bundled database rather than typed here. §12.3 forbids
 * inventing athkar wording, and typing scripture from memory is exactly how the
 * basmalah got its shadda and fatha transposed earlier in this project. Only the
 * interface sample is written by hand, because prayer names are labels rather than
 * revealed text.
 */
function usePreviews(): Record<TypographyContext, string> {
  const [quran, setQuran] = useState('');
  const [athkar, setAthkar] = useState('');
  useEffect(() => {
    queryContent<{ text_uthmani: string }>(
      'SELECT text_uthmani FROM verses WHERE surah = 1 AND ayah = 1')
      .then(r => setQuran(r[0]?.text_uthmani ?? ''));
    // The shortest dhikr in the tasbeeh chapter: it fits the preview pane and is
    // the publisher's wording, not mine.
    queryContent<{ text: string }>(
      'SELECT text FROM athkar WHERE category_id = 130 ORDER BY length(text) LIMIT 1')
      .then(r => setAthkar(r[0]?.text ?? ''));
  }, []);
  return {
    quran,
    athkar,
    interface: 'الفجر · الظهر · العصر · المغرب · العشاء',
  };
}
