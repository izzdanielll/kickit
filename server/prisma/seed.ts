import { PrismaClient, Position, Rarity, PackType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Seed Pack Definitions
  const packDefs = [
    { type: PackType.BRONZE, name: 'Bronze Booster Pack', coinCost: 250, gemCost: null, cardCount: 5 },
    { type: PackType.SILVER, name: 'Silver Premier Pack', coinCost: 500, gemCost: null, cardCount: 5 },
    { type: PackType.GOLD, name: 'Gold Elite Pack', coinCost: null, gemCost: 100, cardCount: 5 },
    { type: PackType.PROMO, name: 'Promo Champion Pack', coinCost: null, gemCost: 250, cardCount: 5 },
  ];

  for (const pack of packDefs) {
    await prisma.packDefinition.upsert({
      where: { type: pack.type },
      update: pack,
      create: pack,
    });
  }
  console.log('✅ Pack definitions seeded');

  // 2. Seed Card Templates
  const cardTemplates = [
    // COMMON (70% weight)
    { playerName: 'Aaron Ramsdale', club: 'Southampton', league: 'Premier League', nationality: 'England', position: Position.GK, rarity: Rarity.COMMON, baseAttack: 20, baseDefense: 76, basePace: 65, basePassing: 70, basePhysical: 74, season: '2026/2027' },
    { playerName: 'Harry Maguire', club: 'Manchester United', league: 'Premier League', nationality: 'England', position: Position.DEF, rarity: Rarity.COMMON, baseAttack: 52, baseDefense: 78, basePace: 55, basePassing: 68, basePhysical: 84, season: '2026/2027' },
    { playerName: 'Conor Gallagher', club: 'Atletico Madrid', league: 'La Liga', nationality: 'England', position: Position.MID, rarity: Rarity.COMMON, baseAttack: 72, baseDefense: 74, basePace: 76, basePassing: 75, basePhysical: 80, season: '2026/2027' },
    { playerName: 'Michail Antonio', club: 'West Ham', league: 'Premier League', nationality: 'Jamaica', position: Position.FWD, rarity: Rarity.COMMON, baseAttack: 77, baseDefense: 45, basePace: 78, basePassing: 66, basePhysical: 83, season: '2026/2027' },
    { playerName: 'Emiliano Martinez', club: 'Aston Villa', league: 'Premier League', nationality: 'Argentina', position: Position.GK, rarity: Rarity.COMMON, baseAttack: 15, baseDefense: 81, basePace: 62, basePassing: 74, basePhysical: 77, season: '2026/2027' },
    { playerName: 'Marc Cucurella', club: 'Chelsea', league: 'Premier League', nationality: 'Spain', position: Position.DEF, rarity: Rarity.COMMON, baseAttack: 65, baseDefense: 79, basePace: 78, basePassing: 74, basePhysical: 75, season: '2026/2027' },
    { playerName: 'Fred', club: 'Fenerbahce', league: 'Super Lig', nationality: 'Brazil', position: Position.MID, rarity: Rarity.COMMON, baseAttack: 70, baseDefense: 73, basePace: 75, basePassing: 76, basePhysical: 74, season: '2026/2027' },
    { playerName: 'Callum Wilson', club: 'Newcastle United', league: 'Premier League', nationality: 'England', position: Position.FWD, rarity: Rarity.COMMON, baseAttack: 80, baseDefense: 38, basePace: 79, basePassing: 65, basePhysical: 76, season: '2026/2027' },

    // RARE (20% weight)
    { playerName: 'Gianluigi Donnarumma', club: 'Paris Saint-Germain', league: 'Ligue 1', nationality: 'Italy', position: Position.GK, rarity: Rarity.RARE, baseAttack: 18, baseDefense: 87, basePace: 64, basePassing: 72, basePhysical: 82, season: '2026/2027' },
    { playerName: 'William Saliba', club: 'Arsenal', league: 'Premier League', nationality: 'France', position: Position.DEF, rarity: Rarity.RARE, baseAttack: 58, baseDefense: 88, basePace: 82, basePassing: 76, basePhysical: 84, season: '2026/2027' },
    { playerName: 'Alexis Mac Allister', club: 'Liverpool', league: 'Premier League', nationality: 'Argentina', position: Position.MID, rarity: Rarity.RARE, baseAttack: 78, baseDefense: 76, basePace: 74, basePassing: 85, basePhysical: 77, season: '2026/2027' },
    { playerName: 'Ousmane Dembele', club: 'Paris Saint-Germain', league: 'Ligue 1', nationality: 'France', position: Position.FWD, rarity: Rarity.RARE, baseAttack: 84, baseDefense: 40, basePace: 93, basePassing: 82, basePhysical: 68, season: '2026/2027' },
    { playerName: 'Federico Dimarco', club: 'Inter Milan', league: 'Serie A', nationality: 'Italy', position: Position.DEF, rarity: Rarity.RARE, baseAttack: 76, baseDefense: 81, basePace: 84, basePassing: 84, basePhysical: 73, season: '2026/2027' },

    // EPIC (7% weight)
    { playerName: 'Alisson Becker', club: 'Liverpool', league: 'Premier League', nationality: 'Brazil', position: Position.GK, rarity: Rarity.EPIC, baseAttack: 22, baseDefense: 90, basePace: 68, basePassing: 84, basePhysical: 85, season: '2026/2027' },
    { playerName: 'Virgil van Dijk', club: 'Liverpool', league: 'Premier League', nationality: 'Netherlands', position: Position.DEF, rarity: Rarity.EPIC, baseAttack: 64, baseDefense: 92, basePace: 79, basePassing: 81, basePhysical: 89, season: '2026/2027' },
    { playerName: 'Pedri', club: 'Barcelona', league: 'La Liga', nationality: 'Spain', position: Position.MID, rarity: Rarity.EPIC, baseAttack: 82, baseDefense: 70, basePace: 81, basePassing: 91, basePhysical: 72, season: '2026/2027' },
    { playerName: 'Bukayo Saka', club: 'Arsenal', league: 'Premier League', nationality: 'England', position: Position.FWD, rarity: Rarity.EPIC, baseAttack: 87, baseDefense: 62, basePace: 88, basePassing: 86, basePhysical: 78, season: '2026/2027' },
    { playerName: 'Lautaro Martinez', club: 'Inter Milan', league: 'Serie A', nationality: 'Argentina', position: Position.FWD, rarity: Rarity.EPIC, baseAttack: 89, baseDefense: 50, basePace: 85, basePassing: 78, basePhysical: 86, season: '2026/2027' },

    // LEGENDARY (2.5% weight)
    { playerName: 'Thibaut Courtois', club: 'Real Madrid', league: 'La Liga', nationality: 'Belgium', position: Position.GK, rarity: Rarity.LEGENDARY, baseAttack: 25, baseDefense: 93, basePace: 70, basePassing: 78, basePhysical: 88, season: '2026/2027' },
    { playerName: 'Jude Bellingham', club: 'Real Madrid', league: 'La Liga', nationality: 'England', position: Position.MID, rarity: Rarity.LEGENDARY, baseAttack: 88, baseDefense: 82, basePace: 84, basePassing: 89, basePhysical: 87, season: '2026/2027' },
    { playerName: 'Kylian Mbappe', club: 'Real Madrid', league: 'La Liga', nationality: 'France', position: Position.FWD, rarity: Rarity.LEGENDARY, baseAttack: 94, baseDefense: 42, basePace: 97, basePassing: 84, basePhysical: 82, season: '2026/2027' },
    { playerName: 'Erling Haaland', club: 'Manchester City', league: 'Premier League', nationality: 'Norway', position: Position.FWD, rarity: Rarity.LEGENDARY, baseAttack: 95, baseDefense: 48, basePace: 90, basePassing: 72, basePhysical: 92, season: '2026/2027' },

    // MYTHIC (0.5% weight)
    { playerName: 'Lionel Messi', club: 'Inter Miami', league: 'MLS', nationality: 'Argentina', position: Position.FWD, rarity: Rarity.MYTHIC, baseAttack: 97, baseDefense: 40, basePace: 86, basePassing: 98, basePhysical: 75, specialTrait: 'GOAT Vision', season: '2026/2027' },
    { playerName: 'Cristiano Ronaldo', club: 'Al Nassr', league: 'Saudi Pro League', nationality: 'Portugal', position: Position.FWD, rarity: Rarity.MYTHIC, baseAttack: 96, baseDefense: 45, basePace: 87, basePassing: 82, basePhysical: 91, specialTrait: 'Siuuu Clutch', season: '2026/2027' },
  ];

  for (const template of cardTemplates) {
    await prisma.cardTemplate.upsert({
      where: {
        playerName_season: {
          playerName: template.playerName,
          season: template.season,
        },
      },
      update: template,
      create: template,
    });
  }
  console.log(`✅ ${cardTemplates.length} card templates seeded`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
