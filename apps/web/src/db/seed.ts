import { db } from './database';
import type { ProductCatalogItem, ProductCategory } from './schema';

interface SeedProduct {
  manufacturer: string;
  productName: string;
  category: ProductCategory;
  weightMultiplier: number;
  unitType: string;
}

const PRODUCT_CATALOG_SEED: SeedProduct[] = [
  // ═══ AUSTIN POWDER ═══
  { manufacturer: 'Austin Powder', productName: '60% Ex Gel - 1.25 x 8 BNAT (Dynamite) (88)', category: 'gel_dynamite', weightMultiplier: 0.5, unitType: 'stick' },
  { manufacturer: 'Austin Powder', productName: '60% Ex Gel - 1.5x16 (Dynamite) (30)', category: 'gel_dynamite', weightMultiplier: 1.4, unitType: 'stick' },
  { manufacturer: 'Austin Powder', productName: '60% Ex Gel - 2.5x16 BNAT (Dynamite) (10)', category: 'gel_dynamite', weightMultiplier: 4.02, unitType: 'stick' },
  { manufacturer: 'Austin Powder', productName: '60% Ex Gel - 2x16 BNAT (Dynamite) (17/18)', category: 'gel_dynamite', weightMultiplier: 2.5, unitType: 'stick' },
  { manufacturer: 'Austin Powder', productName: 'Anfo - Austinite 15', category: 'anfo', weightMultiplier: 50, unitType: 'bag' },
  { manufacturer: 'Austin Powder', productName: 'Anfo - WR 300', category: 'anfo_wr', weightMultiplier: 50, unitType: 'bag' },
  { manufacturer: 'Austin Powder', productName: 'Booster - 500 - 3-hole (1#)', category: 'booster', weightMultiplier: 1, unitType: 'each' },
  { manufacturer: 'Austin Powder', productName: 'Booster - Black Cap', category: 'booster', weightMultiplier: 0.75, unitType: 'each' },
  { manufacturer: 'Austin Powder', productName: 'Booster - Brown Cap', category: 'booster', weightMultiplier: 0.5, unitType: 'each' },
  { manufacturer: 'Austin Powder', productName: 'Booster - Eagle 225 {1/2#}', category: 'booster', weightMultiplier: 0.5, unitType: 'each' },
  { manufacturer: 'Austin Powder', productName: 'Booster - Eagle 450 {1#}', category: 'booster', weightMultiplier: 1, unitType: 'each' },
  { manufacturer: 'Austin Powder', productName: 'Booster - Green Cap', category: 'booster', weightMultiplier: 0.33, unitType: 'each' },
  { manufacturer: 'Austin Powder', productName: 'Booster - Orange Cap', category: 'booster', weightMultiplier: 1, unitType: 'each' },
  { manufacturer: 'Austin Powder', productName: 'Booster Electronic - Eagle 450 {1#}', category: 'booster_electronic', weightMultiplier: 1, unitType: 'each' },
  { manufacturer: 'Austin Powder', productName: 'Booster Electronic - Eagle 500 (3 hole) {1#}', category: 'booster_electronic', weightMultiplier: 1, unitType: 'each' },
  { manufacturer: 'Austin Powder', productName: 'Emuline - 7/8 - Stk', category: 'emulsion', weightMultiplier: 50, unitType: 'stick' },
  { manufacturer: 'Austin Powder', productName: 'Hydromite 860 - 3 x 10 - WPP', category: 'emulsion', weightMultiplier: 10, unitType: 'stick' },
  { manufacturer: 'Austin Powder', productName: 'Hydromite 880 - 2.25 x 16 (19)', category: 'emulsion', weightMultiplier: 2.6315, unitType: 'stick' },
  { manufacturer: 'Austin Powder', productName: 'Hydromite 880 - 2.50 x 16 (15)', category: 'emulsion', weightMultiplier: 3.3334, unitType: 'stick' },
  { manufacturer: 'Austin Powder', productName: 'Hydromite 880 - 2.75 x 16 (12)', category: 'emulsion', weightMultiplier: 4.1666, unitType: 'stick' },
  { manufacturer: 'Austin Powder', productName: 'Hydromite 883 - 2 x 16 (21)', category: 'emulsion', weightMultiplier: 2.381, unitType: 'stick' },
  { manufacturer: 'Austin Powder', productName: 'Hydromite 883 - 2.5 x 16 (15)', category: 'emulsion', weightMultiplier: 3.3333, unitType: 'stick' },
  { manufacturer: 'Austin Powder', productName: 'Hydromite 886 - 2 x 16 (21)', category: 'emulsion', weightMultiplier: 2.381, unitType: 'stick' },
  { manufacturer: 'Austin Powder', productName: 'Hydromite 886 - 2.50 x 16 (15)', category: 'emulsion', weightMultiplier: 3.3334, unitType: 'stick' },
  { manufacturer: 'Austin Powder', productName: 'Hydromite 886 - 2.75 x 16 (12)', category: 'emulsion', weightMultiplier: 4.1666, unitType: 'stick' },
  { manufacturer: 'Austin Powder', productName: 'Hydromite 886 - 3 x 16 (10)', category: 'emulsion', weightMultiplier: 5, unitType: 'stick' },
  { manufacturer: 'Austin Powder', productName: 'Hydromite WPP - 3.5 x 15 (1)', category: 'emulsion', weightMultiplier: 15, unitType: 'stick' },

  // ═══ ORICA ═══
  { manufacturer: 'Orica', productName: 'Anfo - AMEX - 50lbs Bags', category: 'anfo', weightMultiplier: 50, unitType: 'bag' },
  { manufacturer: 'Orica', productName: 'Anfo - AMEX WR - 50lbs Bags', category: 'anfo_wr', weightMultiplier: 50, unitType: 'bag' },
  { manufacturer: 'Orica', productName: 'Booster - Pentex BC *200 (1/2#)', category: 'booster', weightMultiplier: 0.5, unitType: 'each' },
  { manufacturer: 'Orica', productName: 'Booster - Pentex BC *340 (3/4#)', category: 'booster', weightMultiplier: 0.75, unitType: 'each' },
  { manufacturer: 'Orica', productName: 'Booster - Pentex BC *454g (1#)', category: 'booster', weightMultiplier: 1, unitType: 'each' },
  { manufacturer: 'Orica', productName: 'Fortel Tempus 2.5x7lbs (65x3.18kg)', category: 'cartridge', weightMultiplier: 7, unitType: 'stick' },
  { manufacturer: 'Orica', productName: 'Fortel Tempus 3x11lbs (75x5kg)', category: 'cartridge', weightMultiplier: 11, unitType: 'stick' },
  { manufacturer: 'Orica', productName: 'Fortel Ultra - 2.5x16 (16st/55lbs)', category: 'cartridge', weightMultiplier: 3.4375, unitType: 'stick' },
  { manufacturer: 'Orica', productName: 'Fortel Ultra - 2x16 (25st/55lbs)', category: 'cartridge', weightMultiplier: 2.2, unitType: 'stick' },
  { manufacturer: 'Orica', productName: 'Powerditch 1000 - 1.25 x 8 (88)', category: 'cartridge', weightMultiplier: 0.5091, unitType: 'stick' },
  { manufacturer: 'Orica', productName: 'PowerPro 40x400 - 1.5x16 (30st/45lbs)', category: 'cartridge', weightMultiplier: 1.5, unitType: 'stick' },
  { manufacturer: 'Orica', productName: 'PowerPro 50x400 - 2x16 (18st/46.30lbs)', category: 'cartridge', weightMultiplier: 2.5722, unitType: 'stick' },

  // ═══ INDEPENDENT EXPLOSIVES ═══
  { manufacturer: 'Independent Explosives', productName: 'Anfo - IEmix-12 - (50lb bags)', category: 'anfo', weightMultiplier: 50, unitType: 'bag' },
  { manufacturer: 'Independent Explosives', productName: 'Anfo - IEmiX-12 - W/R (50lb bag)', category: 'anfo_wr', weightMultiplier: 50, unitType: 'bag' },
  { manufacturer: 'Independent Explosives', productName: 'Apex Plus - 3" x 10lbs', category: 'cartridge', weightMultiplier: 10, unitType: 'stick' },
  { manufacturer: 'Independent Explosives', productName: 'Blastex - 2 x 16 (40lbs / 18stks)', category: 'cartridge', weightMultiplier: 2.2222, unitType: 'stick' },
  { manufacturer: 'Independent Explosives', productName: 'Blastex - 2.5 x 16 (40lbs/12st)', category: 'cartridge', weightMultiplier: 3.3333, unitType: 'stick' },
  { manufacturer: 'Independent Explosives', productName: 'Blastex - 2.75 x 16 (38lbs / 9stks)', category: 'cartridge', weightMultiplier: 4.2222, unitType: 'stick' },
  { manufacturer: 'Independent Explosives', productName: 'Booster - Trojan 1# 450G (36/cs)', category: 'booster', weightMultiplier: 1, unitType: 'each' },
  { manufacturer: 'Independent Explosives', productName: 'Booster - Trojan 1/2#', category: 'booster', weightMultiplier: 0.5, unitType: 'each' },
  { manufacturer: 'Independent Explosives', productName: 'Booster - Trojan 350G (3/4#)', category: 'booster', weightMultiplier: 0.75, unitType: 'each' },

  // ═══ MAXAM ═══
  { manufacturer: 'Maxam', productName: 'Anfo - RioXam ANFO - 50lb (22.7KG) Plastic Bag', category: 'anfo', weightMultiplier: 50, unitType: 'bag' },
  { manufacturer: 'Maxam', productName: 'Anfo - RioXam WR - RIOXAMWR50', category: 'anfo_wr', weightMultiplier: 50, unitType: 'bag' },
  { manufacturer: 'Maxam', productName: 'Booster - AES 230G (8oz) 1/2#', category: 'booster', weightMultiplier: 0.5, unitType: 'each' },
  { manufacturer: 'Maxam', productName: 'Booster - AES 400G (14oz) - .875#', category: 'booster', weightMultiplier: 0.875, unitType: 'each' },
  { manufacturer: 'Maxam', productName: 'Booster - APD-P-225 8oz (.225kg) - 1/2#', category: 'booster', weightMultiplier: 0.5, unitType: 'each' },
  { manufacturer: 'Maxam', productName: 'Booster - RioBooster 450 Twinplex (1#)', category: 'booster', weightMultiplier: 1, unitType: 'each' },
  { manufacturer: 'Maxam', productName: 'Riohit - 200 - 2.5" x 7lbs (7lbs)', category: 'cartridge', weightMultiplier: 7, unitType: 'stick' },
  { manufacturer: 'Maxam', productName: 'Riohit - 250 - 2.5"x16" (65MMx400MM)', category: 'cartridge', weightMultiplier: 3.3, unitType: 'stick' },
  { manufacturer: 'Maxam', productName: 'Riohit - MAX - 2 x 16', category: 'cartridge', weightMultiplier: 2.4, unitType: 'stick' },
  { manufacturer: 'Maxam', productName: 'Riohit 250 - 2.5" x 7lbs (7lbs)', category: 'cartridge', weightMultiplier: 7, unitType: 'stick' },
  { manufacturer: 'Maxam', productName: 'Riohit 250 - 3" x 11lbs (11lbs)', category: 'cartridge', weightMultiplier: 11, unitType: 'stick' },
];

export async function seedProductCatalog(): Promise<void> {
  const count = await db.productCatalog.count();
  if (count > 0) return; // already seeded

  const now = new Date().toISOString();
  // Deterministic ids: every device seeds the SAME records, so sync
  // converges by overwrite instead of duplicating the catalog
  const slug = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  const items: ProductCatalogItem[] = PRODUCT_CATALOG_SEED.map((p, index) => ({
    id: `seed-${slug(`${p.manufacturer}-${p.productName}`)}`,
    manufacturer: p.manufacturer,
    productName: p.productName,
    fullDescription: `${p.manufacturer} - ${p.productName}`,
    category: p.category,
    weightMultiplier: p.weightMultiplier,
    unitType: p.unitType,
    sizeDescription: '',
    unitsPerCase: null,
    isActive: true,
    sortOrder: index,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  }));

  await db.productCatalog.bulkAdd(items);
}
