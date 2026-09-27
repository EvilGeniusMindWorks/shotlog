// The public product page at /brochure (Round S25, Sep 27 2026). Outside the
// sign-in gate, unlisted (nothing in the app links to it), online only — a
// marketing page, not a paper. The words and pictures come from brochure/content.ts,
// which the printed piece (/brochure/print) shares.
import { useEffect, useState } from 'react';
import { ShotLogLogo } from '@/components/brand/ShotLogLogo';
import { CONTACT, CTA, FEATURES, FLOW, HERO, META, RECORD, WHO, WHY, type Frame, type Picture } from '@/brochure/content';

const FONTS = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Source+Sans+3:ital,wght@0,400;0,600;1,400&display=swap';

/** Brand type and the device bezels, scoped to the page */
const CSS = `
.bro{font-family:"Source Sans 3","Helvetica Neue",Arial,sans-serif;color:#17233A;background:#fff}
.bro .disp{font-family:"Barlow Condensed","Arial Narrow",Arial,sans-serif;font-weight:700;line-height:1;letter-spacing:-.005em;text-wrap:balance}
.bro .eb{font-family:"Barlow Condensed",Arial,sans-serif;font-weight:600;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#C9481E}
.bro .tablet{border:7px solid #1A2233;border-radius:14px;background:#000;overflow:hidden;aspect-ratio:1280/800;width:100%;box-shadow:0 12px 34px rgba(23,35,58,.16)}
.bro .phone{border:5px solid #1A2233;border-radius:26px;background:#000;overflow:hidden;aspect-ratio:390/800;width:100%;box-shadow:0 12px 34px rgba(23,35,58,.16)}
.bro .map{border:1px solid #d2d9e4;border-radius:10px;overflow:hidden;aspect-ratio:940/640;width:100%;box-shadow:0 12px 34px rgba(23,35,58,.12);background:#eef1f5}
.bro .tablet img,.bro .phone img,.bro .map img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
.bro .combo{position:relative;padding-bottom:6%}
.bro .combo .over{position:absolute;right:-2%;bottom:0;width:27%;min-width:110px}
.bro .steplist li[aria-current="true"]{background:#FFF4D8}
@media (prefers-reduced-motion:no-preference){.bro .steplist li{transition:background .15s ease}}
`;

function Img({ frame }: { frame: Frame }) {
  return (
    <div className={frame.kind}>
      <img src={frame.file} alt={frame.alt} loading="lazy" decoding="async" />
    </div>
  );
}

function Pic({ picture, eager = false }: { picture: Picture; eager?: boolean }) {
  if (picture.kind === 'combo') {
    return (
      <div className="combo">
        <div className={picture.tablet.kind}>
          <img src={picture.tablet.file} alt={picture.tablet.alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />
        </div>
        <div className="over">
          <div className="phone">
            <img src={picture.phone.file} alt={picture.phone.alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />
          </div>
        </div>
      </div>
    );
  }
  if (picture.frame.kind === 'phone') {
    return (
      <div className="flex justify-center">
        <div className="w-[240px] max-w-full">
          <Img frame={picture.frame} />
        </div>
      </div>
    );
  }
  return <Img frame={picture.frame} />;
}

export function BrochurePage() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    document.title = META.title;
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    const previous = meta?.content;
    if (meta) meta.content = META.description;
    if (!document.querySelector(`link[href="${FONTS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = FONTS;
      document.head.appendChild(link);
    }
    return () => {
      if (meta && previous !== undefined) meta.content = previous;
    };
  }, []);
  const s = FLOW.steps[step];

  return (
    <div className="bro min-h-screen" data-brochure>
      <style>{CSS}</style>

      {/* ── hero ── */}
      <header className="bg-[#1C3859] text-white">
        <div className="max-w-6xl mx-auto px-5 py-6 flex items-center justify-between gap-4">
          <ShotLogLogo size={40} tone="light" />
          <a href={`mailto:${CONTACT.email}?subject=ShotLog%20walkthrough`} className="disp text-[15px] tracking-[.06em] uppercase border border-white/40 rounded px-3 py-1.5 hover:bg-white/10" data-brochure-cta="top">
            {HERO.cta}
          </a>
        </div>
        <div className="max-w-6xl mx-auto px-5 pb-14 pt-4 grid gap-10 md:grid-cols-[5fr_7fr] md:items-center">
          <div className="flex flex-col gap-5">
            <div className="eb !text-[#FFC53D]">{HERO.eyebrow}</div>
            <h1 className="disp text-[clamp(38px,6vw,68px)]" data-brochure-h1>{HERO.h}</h1>
            <p className="text-lg md:text-xl text-white/85 max-w-[52ch]">{HERO.p}</p>
            <a href={`mailto:${CONTACT.email}?subject=ShotLog%20walkthrough`} className="disp inline-flex w-fit items-center bg-[#EE7A2E] text-[#14202F] text-xl tracking-[.04em] uppercase rounded px-5 py-3 hover:bg-[#F79A4F]" data-brochure-cta="hero">
              {HERO.cta}
            </a>
          </div>
          <div className="pt-2 md:pt-0 md:pl-6">
            <Pic picture={HERO.picture} eager />
          </div>
        </div>
      </header>

      <main>
        {/* ── why ── */}
        <section className="max-w-6xl mx-auto px-5 py-16 md:py-20">
          <div className="max-w-[760px] flex flex-col gap-4">
            <div className="eb">{WHY.eyebrow}</div>
            <h2 className="disp text-[clamp(30px,4vw,46px)]">{WHY.h}</h2>
            <p className="text-lg text-[#4B5768] max-w-[62ch]">{WHY.p}</p>
          </div>
          <dl className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5">
            {WHY.facts.map(([a, b]) => (
              <div key={a} className="border-t-2 border-[#D2D9E4] pt-2">
                <dt className="disp text-[22px] text-[#1C3859]">{a}</dt>
                <dd className="text-[15px] text-[#4B5768] mt-1">{b}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── the day: a step-through ── */}
        <section className="bg-[#F2F4F8]">
          <div className="max-w-6xl mx-auto px-5 py-16 md:py-20">
            <div className="eb">{FLOW.eyebrow}</div>
            <h2 className="disp text-[clamp(30px,4vw,46px)] mt-3">{FLOW.h}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {FLOW.steps.map((x, i) => (
                <span key={x.short} className="contents">
                  <button
                    type="button"
                    onClick={() => setStep(i)}
                    className={`disp text-[14px] tracking-[.04em] uppercase rounded px-2.5 py-1 border ${i === step ? 'bg-[#1C3859] text-white border-[#1C3859]' : 'bg-white text-[#1C3859] border-[#F3D6A3]'}`}
                    aria-pressed={i === step}
                    data-brochure-step={i + 1}
                  >
                    {x.short}
                  </button>
                  {i < FLOW.steps.length - 1 && <span className="text-[#EE7A2E] font-bold">›</span>}
                </span>
              ))}
            </div>
            <div className="mt-8 grid gap-8 md:grid-cols-[280px_1fr] items-center bg-white border border-[#D2D9E4] rounded-lg p-6">
              <div>
                <div className="w-[240px] max-w-full mx-auto">
                  <div className="phone">
                    <img src={s.frame.file} alt={s.frame.alt} decoding="async" data-brochure-step-frame={step + 1} />
                  </div>
                </div>
                <div className="flex justify-center gap-2 mt-4">
                  <button type="button" onClick={() => setStep((n) => Math.max(0, n - 1))} disabled={step === 0} className="disp text-[15px] tracking-[.05em] uppercase rounded px-3 py-1.5 border border-[#D2D9E4] disabled:opacity-40">Prev</button>
                  <button type="button" onClick={() => setStep((n) => Math.min(FLOW.steps.length - 1, n + 1))} disabled={step === FLOW.steps.length - 1} className="disp text-[15px] tracking-[.05em] uppercase rounded px-3 py-1.5 border border-[#D2D9E4] disabled:opacity-40" data-brochure-next>Next</button>
                </div>
              </div>
              <ol className="steplist flex flex-col gap-1.5 m-0 p-0 list-none">
                {FLOW.steps.map((x, i) => (
                  <li key={x.title} aria-current={i === step} className="grid grid-cols-[34px_1fr] gap-2.5 px-2.5 py-2 rounded-md cursor-pointer" onClick={() => setStep(i)}>
                    <span className="disp text-[15px] text-[#C9481E] bg-[#FFF4D8] border border-[#F3D6A3] rounded px-2 py-0.5 h-fit text-center">{i + 1}</span>
                    <div>
                      <b className="font-semibold">{x.title}</b>
                      <span className="block text-[15px] text-[#4B5768]">{x.text}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ── features ── */}
        {FEATURES.map((ft, i) => (
          <section key={ft.key} className="max-w-6xl mx-auto px-5 py-14 md:py-16 border-b border-[#E3E8EE] last:border-0" data-brochure-feature={ft.key}>
            <div className={`grid gap-8 md:gap-12 items-center md:grid-cols-12`}>
              <div className={`flex flex-col gap-4 md:col-span-5 ${i % 2 ? 'md:order-2' : ''}`}>
                <div className="eb">{ft.eyebrow}</div>
                <h2 className="disp text-[clamp(28px,3.6vw,42px)]">{ft.h}</h2>
                <p className="text-[17px] text-[#2B3542] max-w-[58ch]">{ft.p}</p>
              </div>
              <div className={`md:col-span-7 ${i % 2 ? 'md:order-1' : ''}`}>
                <Pic picture={ft.picture} />
                {ft.picture.caption && <p className="text-sm text-[#7C8798] mt-3">{ft.picture.caption}</p>}
              </div>
            </div>
          </section>
        ))}

        {/* ── who ── */}
        <section className="bg-[#F2F4F8]">
          <div className="max-w-6xl mx-auto px-5 py-16 grid gap-10 md:grid-cols-[5fr_7fr] items-center">
            <div className="flex flex-col gap-4">
              <div className="eb">{WHO.eyebrow}</div>
              <h2 className="disp text-[clamp(30px,4vw,46px)]">{WHO.h}</h2>
              <p className="text-[17px] text-[#2B3542] max-w-[58ch]">{WHO.p}</p>
              <div className="flex flex-wrap gap-2">
                {WHO.roles.map((r) => (
                  <span key={r} className="disp text-[16px] tracking-[.04em] uppercase rounded-full border border-[#D2D9E4] bg-white px-3 py-1 text-[#1C3859]">{r}</span>
                ))}
              </div>
            </div>
            <div className="flex justify-center gap-3 md:gap-4 flex-wrap">
              {WHO.frames.map((fr) => (
                <div key={fr.file} className="w-[30%] min-w-[110px] max-w-[190px]">
                  <Img frame={fr} />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── the record ── */}
        <section className="max-w-6xl mx-auto px-5 py-14">
          <div className="bg-[#1C3859] text-white rounded-lg px-7 py-9 md:px-10 grid gap-6 md:grid-cols-[1fr_2fr] items-center">
            <h2 className="disp text-[clamp(30px,4vw,46px)]">{RECORD.h}</h2>
            <div>
              <p className="text-lg text-white/85">{RECORD.p}</p>
              <div className="flex flex-wrap gap-2 mt-4">
                {RECORD.regs.map((r) => (
                  <span key={r} className="disp text-[14px] tracking-[.06em] uppercase border border-white/40 rounded px-2.5 py-0.5">{r}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── next step ── */}
        <section className="max-w-6xl mx-auto px-5 pt-6 pb-20" id="contact">
          <div className="border-t-4 border-[#EE7A2E] pt-8 grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
            <div className="flex flex-col gap-4">
              <div className="eb">{CTA.eyebrow}</div>
              <h2 className="disp text-[clamp(34px,5vw,56px)]">{CTA.h}</h2>
              <p className="text-lg text-[#4B5768] max-w-[52ch]">{CTA.p}</p>
              <div className="flex flex-wrap gap-3 mt-2">
                <a href={`mailto:${CONTACT.email}?subject=ShotLog%20walkthrough`} className="disp inline-flex items-center bg-[#EE7A2E] text-[#14202F] text-xl tracking-[.04em] uppercase rounded px-5 py-3 hover:bg-[#F79A4F]" data-brochure-cta="bottom">{HERO.cta}</a>
                <a href={CONTACT.pdf} className="disp inline-flex items-center border-2 border-[#D2D9E4] text-[#1C3859] text-xl tracking-[.04em] uppercase rounded px-5 py-3 hover:border-[#1C3859]" data-brochure-pdf>The brochure as a PDF</a>
              </div>
            </div>
            <div className="disp md:text-right leading-tight">
              <a href={CONTACT.phoneHref} className="block text-[34px] text-[#1C3859]" data-brochure-phone>{CONTACT.phoneWord}</a>
              <div className="font-sans text-[14px] text-[#4B5768] tracking-wide">{CONTACT.phoneDigits}</div>
              <a href={`mailto:${CONTACT.email}`} className="block text-[24px] text-[#1C3859] mt-2" data-brochure-email>{CONTACT.email}</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E3E8EE]">
        <div className="max-w-6xl mx-auto px-5 py-6 flex flex-wrap justify-between gap-3 text-sm text-[#7C8798]">
          <span>ShotLog · {CONTACT.site}</span>
          <span>© 2026 · Map imagery: © OpenStreetMap contributors · Every screen shown is from a fictional job</span>
        </div>
      </footer>
    </div>
  );
}
