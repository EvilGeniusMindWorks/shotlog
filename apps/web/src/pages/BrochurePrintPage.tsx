// The printed brochure (Round S25, Sep 27 2026): four Letter pages built from the
// same words and pictures as /brochure — a cover, an inside spread as two facing
// pages, and a back. scripts/brochure-pdf.mjs prints this route to
// public/brochure/ShotLog-Brochure.pdf. Sizes are px at 96 dpi (816 × 1056 = Letter).
import { useEffect } from 'react';
import { CONTACT, CTA, FEATURES, FLOW, HERO, RECORD, WHO, WHY, type Frame } from '@/brochure/content';

const FONTS = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Source+Sans+3:ital,wght@0,400;0,600;1,400&display=swap';
const CSS = `
@page{size:Letter;margin:0}
html,body{margin:0;background:#fff}
.pp{font-family:"Source Sans 3","Helvetica Neue",Arial,sans-serif;color:#17233A;font-size:14.5px;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pp .pg{width:816px;height:1056px;position:relative;overflow:hidden;background:#fff;break-after:page;page-break-after:always;margin:0 auto}
.pp .pg:last-child{break-after:auto;page-break-after:auto}
.pp h1,.pp h2,.pp h3{font-family:"Barlow Condensed","Arial Narrow",Arial,sans-serif;margin:0;color:#1C3859;font-weight:700;text-wrap:balance;line-height:1}
.pp p{margin:0;color:#2B3542}
.pp .eb{font-family:"Barlow Condensed",Arial,sans-serif;text-transform:uppercase;letter-spacing:.14em;font-size:12px;color:#C9481E;font-weight:600}
.pp .navy{background:#1C3859;color:#fff}.pp .navy h1,.pp .navy h2,.pp .navy h3{color:#fff}.pp .navy p{color:rgba(255,255,255,.86)}
.pp .tablet{border:6px solid #1A2233;border-radius:12px;background:#000;overflow:hidden;aspect-ratio:1280/800;box-shadow:0 2px 6px rgba(0,0,0,.18)}
.pp .phone{border:5px solid #1A2233;border-radius:20px;background:#000;overflow:hidden;aspect-ratio:390/800;box-shadow:0 2px 6px rgba(0,0,0,.18)}
.pp .map{border:1px solid #d2d9e4;border-radius:8px;overflow:hidden;aspect-ratio:940/640;box-shadow:0 2px 6px rgba(0,0,0,.18);background:#eef1f5}
.pp .tablet img,.pp .phone img,.pp .map img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
.pp .card{display:flex;flex-direction:column;gap:8px}.pp .card h3{font-size:20px;line-height:1.05}.pp .card p{font-size:13px;line-height:1.35}
.pp .reg{font-family:"Barlow Condensed",Arial,sans-serif;font-weight:600;letter-spacing:.06em;text-transform:uppercase;font-size:12px;padding:2px 8px;border:1px solid rgba(255,255,255,.4);border-radius:3px;color:#fff}
.pp .role{font-family:"Barlow Condensed",Arial,sans-serif;font-weight:600;font-size:13px;letter-spacing:.04em;text-transform:uppercase;padding:2px 9px;border-radius:999px;border:1px solid #d2d9e4;color:#1C3859}
.pp .stepn{font-family:"Barlow Condensed",Arial,sans-serif;font-weight:700;font-size:13px;background:#FFF4D8;color:#C9481E;border:1px solid #F3D6A3;border-radius:4px;padding:1px 6px;height:fit-content}
.pp .foot{position:absolute;left:48px;right:48px;bottom:28px;display:flex;justify-content:space-between;font-family:"Barlow Condensed",Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;font-size:13px;color:#4B5768}
@media screen{.pp{background:#e9edf3;padding:20px 0}.pp .pg{box-shadow:0 2px 6px rgba(0,0,0,.12),0 18px 50px rgba(0,0,0,.18);margin-bottom:20px}}
`;

const F = (frame: Frame, width: number) => (
  <div className={frame.kind} style={{ width }}>
    <img src={frame.file} alt={frame.alt} />
  </div>
);
const feature = (key: string) => FEATURES.find((x) => x.key === key)!;
const tabletOf = (key: string): Frame => { const p = feature(key).picture; return p.kind === 'combo' ? p.tablet : p.frame; };

function Step({ i, w }: { i: number; w: number }) {
  const s = FLOW.steps[i];
  return (
    <div>
      {F(s.frame, w)}
      <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <span className="stepn">{i + 1}</span>
        <div>
          <b style={{ fontSize: 14, lineHeight: 1.2, display: 'block' }}>{s.title}</b>
          <span style={{ fontSize: 12.5, color: '#4B5768', lineHeight: 1.3, display: 'block' }}>{s.text}</span>
        </div>
      </div>
    </div>
  );
}

function Card({ frameKey, h, p, width = 291, frame }: { frameKey?: string; h: string; p: string; width?: number; frame?: Frame }) {
  const fr = frame ?? tabletOf(frameKey!);
  return (
    <div className="card">
      {F(fr, width)}
      <h3>{h}</h3>
      <p>{p}</p>
    </div>
  );
}

export function BrochurePrintPage() {
  useEffect(() => {
    document.title = 'ShotLog brochure · print';
    if (!document.querySelector(`link[href="${FONTS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = FONTS;
      document.head.appendChild(link);
    }
  }, []);
  const map = feature('map'), des = feature('designer'), math = feature('math'), drill = feature('drilling'), off = feature('office'), rec = feature('records'), safe = feature('safety'), offline = feature('offline');
  const heroTablet = HERO.picture.kind === 'combo' ? HERO.picture.tablet : HERO.picture.frame;
  const heroPhone = HERO.picture.kind === 'combo' ? HERO.picture.phone : FLOW.steps[2].frame;
  return (
    <div className="pp" data-brochure-print>
      <style>{CSS}</style>

      {/* page 1 · cover */}
      <div className="pg" data-print-page="cover">
        <div className="navy" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 600, padding: '44px 48px 0' }}>
          <img src="/shotlog-lockup-dark.svg" alt="ShotLog" style={{ height: 46, display: 'block' }} />
          <h1 style={{ fontSize: 58, lineHeight: 0.98, marginTop: 40, maxWidth: 660 }}>{HERO.h}</h1>
          <p style={{ fontSize: 19, marginTop: 18, maxWidth: 560 }}>{HERO.p}</p>
        </div>
        <div style={{ position: 'absolute', left: 48, top: 520 }}>{F(heroTablet, 600)}</div>
        <div style={{ position: 'absolute', right: 44, top: 640 }}>{F(heroPhone, 170)}</div>
        <div className="foot"><span>For licensed blasting crews</span><span>{CONTACT.site}/brochure</span></div>
      </div>

      {/* page 2 · inside left: the day begins, the map and the designer */}
      <div className="pg" data-print-page="inside-left" style={{ padding: '40px 24px 0 44px' }}>
        <div className="eb">{FLOW.eyebrow}</div>
        <h2 style={{ fontSize: 40 }}>{FLOW.h}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22, marginTop: 16 }}>
          <Step i={0} w={200} /><Step i={1} w={200} /><Step i={2} w={200} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, marginTop: 30 }}>
          <Card frame={tabletOf('map')} h={map.h} p={map.p} width={352} />
          <Card frameKey="designer" h={des.h} p={des.p} width={352} />
        </div>
        <div className="foot" style={{ right: 24 }}><span>{WHY.h}</span><span>2</span></div>
      </div>

      {/* page 3 · inside right: the day ends, the math, drilling and the office */}
      <div className="pg" data-print-page="inside-right" style={{ padding: '40px 44px 0 24px' }}>
        <div style={{ height: 54 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22, marginTop: 16 }}>
          <Step i={3} w={200} /><Step i={4} w={200} /><Step i={5} w={200} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22, marginTop: 30 }}>
          <Card frame={{ kind: 'tablet', file: '/brochure/seismo-scan--tablet.webp', alt: 'The seismograph printout scanned on a tablet' }} h={math.h} p={math.p} width={228} />
          <Card frameKey="drilling" h={drill.h} p={drill.p} width={228} />
          <Card frameKey="office" h={off.h} p={`${off.p} ${rec.p}`} width={228} />
        </div>
        <div className="foot" style={{ left: 24 }}><span>3</span><span>{CONTACT.site}/brochure</span></div>
      </div>

      {/* page 4 · back */}
      <div className="pg" data-print-page="back" style={{ padding: '44px 48px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 24, alignItems: 'center' }}>
          {F(tabletOf('safety'), 420)}
          <div>
            <div className="eb">{safe.eyebrow}</div>
            <h2 style={{ fontSize: 30 }}>{safe.h}</h2>
            <p style={{ marginTop: 10, fontSize: 14 }}>{safe.p}</p>
          </div>
        </div>
        <div className="navy" style={{ padding: '24px 28px', borderRadius: 6 }}>
          <h2 style={{ fontSize: 32 }}>{RECORD.h}</h2>
          <p style={{ margin: '8px 0 12px', fontSize: 14 }}>{RECORD.p}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{RECORD.regs.map((r) => <span key={r} className="reg">{r}</span>)}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '276px 1fr', gap: 24, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8 }}>{WHO.frames.map((fr) => <span key={fr.file}>{F(fr, 84)}</span>)}</div>
          <div>
            <div className="eb">{WHO.eyebrow}</div>
            <h3 style={{ fontSize: 26 }}>{WHO.h}</h3>
            <p style={{ marginTop: 6, fontSize: 13.5 }}>{WHO.p}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>{WHO.roles.map((r) => <span key={r} className="role">{r}</span>)}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '276px 1fr', gap: 24, alignItems: 'start', borderTop: '1px solid #d2d9e4', paddingTop: 14 }}>
          <div><div className="eb">{offline.eyebrow}</div><h3 style={{ fontSize: 24 }}>{offline.h}</h3></div>
          <p style={{ fontSize: 13.5 }}>{offline.p}</p>
        </div>
        <div style={{ marginTop: 'auto', borderTop: '4px solid #EE7A2E', paddingTop: 18, display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'end' }}>
          <div>
            <h2 style={{ fontSize: 40 }}>{CTA.h}</h2>
            <p style={{ marginTop: 8, fontSize: 15, maxWidth: 420 }}>{CTA.p}</p>
          </div>
          <div style={{ textAlign: 'right', fontFamily: '"Barlow Condensed", Arial, sans-serif', lineHeight: 1.1 }}>
            <div style={{ fontSize: 30, fontWeight: 700, color: '#1C3859' }}>{CONTACT.phoneWord}</div>
            <div style={{ fontSize: 13, color: '#4B5768', letterSpacing: '.06em' }}>{CONTACT.phoneDigits}</div>
            <div style={{ fontSize: 21, fontWeight: 600, color: '#1C3859', marginTop: 6 }}>{CONTACT.email}</div>
            <div style={{ fontSize: 12, color: '#7C8798', letterSpacing: '.1em', textTransform: 'uppercase', marginTop: 6 }}>{CONTACT.site}/brochure</div>
          </div>
        </div>
      </div>
    </div>
  );
}
