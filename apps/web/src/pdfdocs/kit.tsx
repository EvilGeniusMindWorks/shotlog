// Shared primitives for the text-native (searchable) PDF documents.
//
// These documents replace the old html2canvas screenshots: real text drawn
// with the PDF-native Helvetica faces, so filed copies are searchable,
// selectable, and ~10× smaller. Layout mirrors Baystate's paper forms the
// same way the print pages do.
//
// Font note: Helvetica's WinAnsi encoding has no ✓/☑/☐/⚠ glyphs — use the
// CHECK/BOX_* / WARN constants instead of pasting those characters.
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ReactNode } from 'react';
import type { Style } from '@react-pdf/types';

export const CHECK = 'X';
export const BOX_ON = '[X]';
export const BOX_OFF = '[  ]';
export const WARN = '(!)';

export const K = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 34,
    paddingHorizontal: 30,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#000',
  },
  bold: { fontFamily: 'Helvetica-Bold' },
  italic: { fontFamily: 'Helvetica-Oblique' },
  boldItalic: { fontFamily: 'Helvetica-BoldOblique' },
  val: { fontFamily: 'Helvetica-Bold', color: '#1a365d' },
  muted: { color: '#666' },
  center: { textAlign: 'center' },
  right: { textAlign: 'right' },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 2,
    borderBottomColor: '#000',
    paddingBottom: 4,
    marginBottom: 6,
  },
  companyName: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  companySub: { fontSize: 7, color: '#666' },
  docTitle: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 30,
    right: 30,
    fontSize: 6.5,
    color: '#888',
    textAlign: 'center',
  },
});

/** Bordered table: the table draws top+left, every cell draws right+bottom —
 *  net effect is single 0.75pt rules everywhere, like border-collapse. */
export function T({ style, children }: { style?: Style | Style[]; children: ReactNode }) {
  return (
    <View
      style={[
        { borderTopWidth: 0.75, borderLeftWidth: 0.75, borderColor: '#000' },
        ...(Array.isArray(style) ? style : style ? [style] : []),
      ]}
    >
      {children}
    </View>
  );
}

export function TR({ style, shade, children }: { style?: Style; shade?: boolean; children: ReactNode }) {
  return (
    <View style={[{ flexDirection: 'row' }, shade ? { backgroundColor: '#e8e8e8' } : {}, style ?? {}]}>
      {children}
    </View>
  );
}

/**
 * Table cell. `w` = fixed width in pt; omit for flex:1 (or pass `flex`).
 * Children that are plain strings/numbers are wrapped in <Text>.
 */
export function TD({
  w,
  flex,
  style,
  textStyle,
  children,
}: {
  w?: number;
  flex?: number;
  style?: Style | Style[];
  textStyle?: Style | Style[];
  children?: ReactNode;
}) {
  const wrapped =
    typeof children === 'string' || typeof children === 'number' ? (
      <Text style={textStyle}>{children}</Text>
    ) : (
      children ?? <Text> </Text>
    );
  return (
    <View
      style={[
        {
          borderRightWidth: 0.75,
          borderBottomWidth: 0.75,
          borderColor: '#000',
          paddingVertical: 1.5,
          paddingHorizontal: 3,
          justifyContent: 'center',
        },
        w !== undefined ? { width: w } : { flex: flex ?? 1 },
        ...(Array.isArray(style) ? style : style ? [style] : []),
      ]}
    >
      {wrapped}
    </View>
  );
}

export function HeaderBar({
  companyName,
  dealerNumber,
  title,
}: {
  companyName: string;
  dealerNumber?: string;
  title: string;
}) {
  return (
    <View style={K.headerBar}>
      <View>
        <Text style={K.companyName}>{companyName}</Text>
        {dealerNumber ? <Text style={K.companySub}>Dealer #{dealerNumber}</Text> : null}
      </View>
      <Text style={K.docTitle}>{title}</Text>
    </View>
  );
}

export function Footer({ text }: { text: string }) {
  return <Text style={K.footer} fixed>{text}</Text>;
}

/** Label + value on one line: <b>Label:</b> value */
export function LV({
  label,
  value,
  size,
}: {
  label: string;
  value: string | number | null | undefined;
  size?: number;
}) {
  return (
    <Text style={size ? { fontSize: size } : undefined}>
      <Text style={K.bold}>{label} </Text>
      <Text style={K.val}>{value === undefined || value === null || value === '' ? '—' : String(value)}</Text>
    </Text>
  );
}

export function dash(v: string | number | null | undefined, suffix = ''): string {
  if (v === null || v === undefined || v === '' || v === 0) return '—';
  return `${v}${suffix}`;
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

/** Blob → data URL for react-pdf <Image> (signatures, map snapshots). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Signature slot: image when present, a ruled line otherwise. */
export function Signature({ dataUrl, height = 26 }: { dataUrl: string | null; height?: number }) {
  if (dataUrl) {
    return <Image src={dataUrl} style={{ height, objectFit: 'contain', objectPositionX: 0 }} />;
  }
  return <Text>________________</Text>;
}

export { Document, Page, Text, View, Image };
