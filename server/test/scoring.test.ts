import { strict as assert } from 'node:assert';
import { Position } from '@prisma/client';
import { calculateFantasyPoints, rarityMultiplierBps } from '../src/gameweeks/scoring';

const base = { minutesPlayed: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, ownGoals: 0, penaltyMisses: 0, cleanSheet: false, saves: 0, penaltySaves: 0 };
assert.equal(calculateFantasyPoints(Position.FWD, { ...base, minutesPlayed: 90, goals: 1, assists: 1 }), 8);
assert.equal(calculateFantasyPoints(Position.DEF, { ...base, minutesPlayed: 90, goals: 1, cleanSheet: true }), 11);
assert.equal(calculateFantasyPoints(Position.GK, { ...base, minutesPlayed: 90, cleanSheet: true, saves: 7, penaltySaves: 1 }), 11);
assert.equal(calculateFantasyPoints(Position.MID, { ...base, minutesPlayed: 30, redCards: 1 }), -2);
assert.equal(rarityMultiplierBps('MYTHIC'), 12500);
assert.equal(rarityMultiplierBps('UNKNOWN'), 10000);
console.log('Scoring tests passed');
