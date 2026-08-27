import { useEffect, useState, type ReactNode } from 'react';
import {
  Bell, BookOpen, Check, Compass, Download, MapPin, Play, Settings, Trash2, Volume2,
} from 'lucide-react';
import {
  Badge, Button, Card, EmptyState, IconButton, List, ListRow, Material, Popover,
  ProgressRing, SearchField, SegmentedControl, Sheet, Skeleton, Slider, Switch,
  ToastLayer, Tooltip, useToasts,
} from '../components/ui';
import {
  ACCENTS, applyAppearance, loadAppearance, saveAppearance, type Accent, type ThemeChoice,
} from '../design/theme';
import { setBackdropOverride, supportsBackdropFilter } from '../design/capabilities';
import './Gallery.css';

const THEMES = [
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
  { value: 'system' as const, label: 'System' },
];

function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {note && <p className="section-note">{note}</p>}
      {children}
    </section>
  );
}

function Specimen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="specimen">
      <span className="specimen-label">{label}</span>
      <div className="specimen-row">{children}</div>
    </div>
  );
}

export default function Gallery() {
  const [{ theme, accent }, setAppearance] = useState(loadAppearance);
  const [backdrop, setBackdrop] = useState<'auto' | 'on' | 'off'>('auto');
  const [dir, setDir] = useState<'ltr' | 'rtl'>(
    () => (document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr'));

  // Component state for the interactive specimens.
  const [seg, setSeg] = useState<'mushaf' | 'reading'>('mushaf');
  const [notify, setNotify] = useState(true);
  const [silentFajr, setSilentFajr] = useState(false);
  const [volume, setVolume] = useState(70);
  const [lineHeight, setLineHeight] = useState(2.2);
  const [query, setQuery] = useState('');
  const [bottomSheet, setBottomSheet] = useState(false);
  const [sideSheet, setSideSheet] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  useEffect(() => {
    applyAppearance({ theme, accent });
    saveAppearance({ theme, accent });
  }, [theme, accent]);

  useEffect(() => {
    setBackdropOverride(backdrop === 'auto' ? null : backdrop === 'on');
  }, [backdrop]);

  // §9 requires a complete LTR<->RTL flip at runtime with no restart. Every
  // component here uses logical properties, so this is the proof of that.
  useEffect(() => {
    document.documentElement.dir = dir;
    // The gallery owns the document direction only while it is mounted.
    return () => { document.documentElement.dir = 'rtl'; };
  }, [dir]);

  return (
    <div className="gallery">
      <Material level="regular" className="gallery-bar">
        <h1>Components</h1>
        <span className="spacer" />

        <div className="gallery-bar-group">
          <span className="gallery-bar-label">Theme</span>
          <SegmentedControl
            options={THEMES}
            value={theme}
            onChange={(t: ThemeChoice) => setAppearance(a => ({ ...a, theme: t }))}
          />
        </div>

        <div className="gallery-bar-group">
          <span className="gallery-bar-label">Accent</span>
          <div className="gallery-swatches">
            {ACCENTS.map(a => (
              <button key={a} className="gallery-swatch" aria-label={a} aria-pressed={accent === a}
                style={{ background: `var(--accent-${a})` }}
                onClick={() => setAppearance(s => ({ ...s, accent: a as Accent }))} />
            ))}
          </div>
        </div>

        <div className="gallery-bar-group">
          <span className="gallery-bar-label">Direction</span>
          <SegmentedControl
            options={[
              { value: 'ltr' as const, label: 'LTR' },
              { value: 'rtl' as const, label: 'RTL' },
            ]}
            value={dir}
            onChange={setDir}
          />
        </div>

        <div className="gallery-bar-group">
          <span className="gallery-bar-label">Backdrop</span>
          <SegmentedControl
            options={[
              { value: 'auto' as const, label: `Auto (${supportsBackdropFilter() ? 'on' : 'off'})` },
              { value: 'on' as const, label: 'Force on' },
              { value: 'off' as const, label: 'Force off' },
            ]}
            value={backdrop}
            onChange={setBackdrop}
          />
        </div>
      </Material>

      <div className="gallery-body">
        <Section
          title="Material"
          note={
            <>
              §6.4 — three levels over a patterned bed so the translucency is visible.
              WebKitGTK support for <code>backdrop-filter</code> is inconsistent, so it is
              feature-detected at startup and falls back to an opaque surface at the same
              lightness. Use “Force off” above to check that path deliberately: the layout
              must not shift, only the translucency should disappear.
            </>
          }
        >
          <div className="material-bed">
            <div className="grid-2">
              {(['thin', 'regular', 'thick'] as const).map(level => (
                <Material key={level} level={level} className="material-chip">
                  {level}
                </Material>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Button" note="§6.6 — filled, tinted and plain, in three sizes, with hover, active, focus and disabled states. Press scales to 0.97 and lifts the shadow (§6.5). Tab to see the 2px accent focus ring at 2px offset.">
          <div className="stack">
            {(['filled', 'tinted', 'plain'] as const).map(variant => (
              <Specimen key={variant} label={variant}>
                <Button variant={variant} size="sm">Small</Button>
                <Button variant={variant}>Play adhan</Button>
                <Button variant={variant} size="lg"><Play size={16} strokeWidth={1.5} />Large</Button>
                <Button variant={variant} disabled>Disabled</Button>
              </Specimen>
            ))}
            <Specimen label="IconButton">
              <IconButton label="Play"><Play size={16} strokeWidth={1.5} /></IconButton>
              <IconButton label="Bookmark" active><BookOpen size={16} strokeWidth={1.5} /></IconButton>
              <IconButton label="Settings"><Settings size={16} strokeWidth={1.5} /></IconButton>
              <IconButton label="Delete" disabled><Trash2 size={16} strokeWidth={1.5} /></IconButton>
            </Specimen>
          </div>
        </Section>

        <Section title="SegmentedControl" note="The thumb springs between options (stiffness 260, damping 30). Arrow keys move selection, and they follow the logical direction so they stay correct under RTL.">
          <div className="specimens">
            <Specimen label="two options">
              <SegmentedControl
                options={[
                  { value: 'mushaf' as const, label: 'Mushaf' },
                  { value: 'reading' as const, label: 'Reading' },
                ]}
                value={seg}
                onChange={setSeg}
              />
            </Specimen>
            <Specimen label="with a disabled option">
              <SegmentedControl
                options={[
                  { value: 'mushaf' as const, label: 'Mushaf' },
                  { value: 'reading' as const, label: 'Reading' },
                  { value: 'audio' as const, label: 'Audio', disabled: true },
                ]}
                value={seg}
                onChange={v => v !== 'audio' && setSeg(v)}
              />
            </Specimen>
            <Specimen label="disabled">
              <SegmentedControl
                options={[{ value: 'a' as const, label: 'One' }, { value: 'b' as const, label: 'Two' }]}
                value="a" onChange={() => {}} disabled
              />
            </Specimen>
          </div>
        </Section>

        <Section title="Switch & Slider" note="Switch is an iOS-style track and knob, the knob on a spring. Slider is a native range input under custom styling, so keyboard stepping and ARIA come from the platform.">
          <Card>
            <div className="stack">
              <div className="specimen-row" style={{ justifyContent: 'space-between' }}>
                <span>Prayer notifications</span>
                <Switch checked={notify} onChange={setNotify} label="Prayer notifications" />
              </div>
              <div className="specimen-row" style={{ justifyContent: 'space-between' }}>
                <span>Silent for Fajr</span>
                <Switch checked={silentFajr} onChange={setSilentFajr} label="Silent for Fajr" />
              </div>
              <div className="specimen-row" style={{ justifyContent: 'space-between' }}>
                <span style={{ opacity: 0.4 }}>Disabled</span>
                <Switch checked={false} onChange={() => {}} label="Disabled example" disabled />
              </div>
              <Slider label="Adhan volume" value={volume} onChange={setVolume}
                format={v => `${v}%`} />
              <Slider label="Quran line height" value={lineHeight} min={2} max={2.4} step={0.05}
                onChange={setLineHeight} format={v => v.toFixed(2)} />
              <Slider label="Disabled slider" value={40} onChange={() => {}} disabled />
            </div>
          </Card>
        </Section>

        <Section
          title="ListRow"
          note="§6.6 calls out the separator inset as “very visible and usually gotten wrong”. The rule starts at the content inset, not the container edge, and runs to the trailing edge — and when a row has a leading icon it aligns to the text rather than the icon."
        >
          <div className="grid-2">
            <List>
              <ListRow title="الفجر" subtitle="Fajr" trailing="4:38" onClick={() => {}} />
              <ListRow title="الشروق" subtitle="Sunrise" trailing="6:02" onClick={() => {}} />
              <ListRow title="الظهر" subtitle="Dhuhr" trailing="12:41" tinted onClick={() => {}} />
              <ListRow title="العصر" subtitle="Asr" trailing="16:15" onClick={() => {}} />
              <ListRow title="المغرب" subtitle="Maghrib" trailing="19:20" disabled />
            </List>
            <List>
              <ListRow leading={<MapPin size={18} strokeWidth={1.5} />} title="Location"
                subtitle="Ajloun, Jordan" trailing="›" onClick={() => {}} />
              <ListRow leading={<Bell size={18} strokeWidth={1.5} />} title="Notifications"
                trailing={<Switch checked={notify} onChange={setNotify} label="Notifications" />} />
              <ListRow leading={<Volume2 size={18} strokeWidth={1.5} />} title="Adhan volume"
                trailing={`${volume}%`} onClick={() => {}} />
              <ListRow leading={<Compass size={18} strokeWidth={1.5} />} title="Qibla"
                trailing={<Badge tone="accent">157°</Badge>} onClick={() => {}} />
            </List>
          </div>
        </Section>

        <Section title="Badge, ProgressRing, Skeleton" note="Prayer-state colours per §6.3: a missed prayer is never red — this app does not scold the user — so the “missed” tone is a quiet outline. No spinners where a skeleton will do (§6.5).">
          <div className="specimens">
            <Specimen label="Badge">
              <Badge tone="neutral">Passed</Badge>
              <Badge tone="accent">Now</Badge>
              <Badge tone="solid">12</Badge>
              <Badge tone="outline">Missed</Badge>
            </Specimen>
            <Specimen label="ProgressRing">
              <ProgressRing value={0.25} label="25 percent elapsed" />
              <ProgressRing value={0.62} label="62 percent elapsed">62%</ProgressRing>
              <ProgressRing value={1} label="Complete" size={56} thickness={5}>
                <Check size={16} strokeWidth={1.5} />
              </ProgressRing>
            </Specimen>
          </div>
          <div style={{ marginBlockStart: 'var(--space-5)', maxInlineSize: 380 }}>
            <span className="specimen-label">Skeleton</span>
            <Card>
              <div className="stack">
                <Skeleton width="45%" height={18} />
                <Skeleton />
                <Skeleton width="80%" />
                <Skeleton width={44} height={44} radius="var(--radius-full)" />
              </div>
            </Card>
          </div>
        </Section>

        <Section title="SearchField" note="Diacritic-insensitive search lands in Phase 4 (§5.4); this is the field itself, with its clear affordance and focus state.">
          <div className="specimens">
            <Specimen label="empty">
              <div style={{ inlineSize: 280 }}>
                <SearchField value={query} onChange={setQuery} placeholder="Search surah or 2:255" />
              </div>
            </Specimen>
            <Specimen label="disabled">
              <div style={{ inlineSize: 200 }}>
                <SearchField value="" onChange={() => {}} placeholder="Unavailable" disabled />
              </div>
            </Specimen>
          </div>
        </Section>

        <Section title="Popover, Tooltip, Toast" note="Popover dismisses on outside click and Esc. Tooltip reveals on hover and on focus, so keyboard users get it too. Toasts are announced politely rather than interrupting.">
          <div className="specimens">
            <Specimen label="Popover">
              <Popover
                label="Reciter"
                trigger={p => <Button variant="tinted" {...p}>Choose reciter</Button>}
              >
                <List>
                  <ListRow title="Mishary Alafasy" onClick={() => {}} />
                  <ListRow title="Abdul Basit (Murattal)" onClick={() => {}} />
                  <ListRow title="Husary" onClick={() => {}} />
                </List>
              </Popover>
            </Specimen>
            <Specimen label="Tooltip">
              <Tooltip text="Download this surah for offline listening">
                <IconButton label="Download"><Download size={16} strokeWidth={1.5} /></IconButton>
              </Tooltip>
            </Specimen>
            <Specimen label="Toast">
              <Button variant="plain" onClick={() => push('Al-Minabr is still running in the panel')}>
                Show toast
              </Button>
              <Button variant="plain" onClick={() => push('Surah downloaded', <Check size={15} strokeWidth={1.5} />)}>
                With icon
              </Button>
            </Specimen>
          </div>
        </Section>

        <Section title="Sheet" note="§6.5 — sheets are things a finger would grab, so they use a spring rather than a duration and drag to dismiss. Esc closes them (§10). Under prefers-reduced-motion the transform collapses to an opacity fade and dragging is disabled, because there is nothing to grab if nothing moves.">
          <div className="specimen-row">
            <Button onClick={() => setBottomSheet(true)}>Bottom sheet</Button>
            <Button variant="tinted" onClick={() => setSideSheet(true)}>Side sheet</Button>
          </div>
        </Section>

        <Section title="EmptyState" note="§4.2 — when nothing is downloaded and there is no connection, the play button is disabled with a clear explanation, never a silent failure.">
          <Card padded={false}>
            <EmptyState
              icon={<Download size={22} strokeWidth={1.5} />}
              title="No recitation downloaded"
              body="Recitation audio is not bundled — it is hundreds of megabytes. Download a surah or juz to listen offline."
              action={<Button variant="tinted">Open download manager</Button>}
            />
          </Card>
        </Section>
      </div>

      <Sheet open={bottomSheet} onClose={() => setBottomSheet(false)} side="bottom" title="Location">
        <div className="stack">
          <SearchField value={query} onChange={setQuery} placeholder="Search a city" />
          <List>
            <ListRow leading={<MapPin size={18} strokeWidth={1.5} />} title="Ajloun"
              subtitle="Jordan · 32.3326, 35.7517" onClick={() => setBottomSheet(false)} />
            <ListRow leading={<MapPin size={18} strokeWidth={1.5} />} title="Makkah"
              subtitle="Saudi Arabia · 21.3891, 39.8579" onClick={() => setBottomSheet(false)} />
          </List>
          <p className="section-note" style={{ margin: 0 }}>
            Drag the sheet down, press Esc, or tap outside to dismiss.
          </p>
        </div>
      </Sheet>

      <Sheet open={sideSheet} onClose={() => setSideSheet(false)} side="side" title="Tafsir">
        <p className="section-note" style={{ margin: 0 }}>
          Tafsir and translation open in a side panel rather than a modal, so reading
          continues (§7.2). The bundled text arrives in Phase 4 — nothing is invented here.
        </p>
      </Sheet>

      <ToastLayer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
