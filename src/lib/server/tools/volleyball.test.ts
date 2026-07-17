import { describe, it, expect } from 'vitest';
import {
	parseFixtureDate,
	parseRoundIndex,
	parseRoundGames,
	parseStandings,
	weekendDates
} from './volleyball';

// Trimmed real markup from volleyballnsw.com.au (RevolutioniseSPORT) — the
// round index rows on a division draw page, and one game card per state
// (upcoming "vs" / played score). Public data; teams here are deliberately
// not any configured family team.
const INDEX_HTML = `
<div class="px-4 py-2 d-lg-flex align-items-center justify-content-start border-top ">
	<a href="https://www.volleyballnsw.com.au/games/00000/00000/round/7"><b> Round 7 </b></a>
	<div class="d-none d-lg-inline-block mx-2">&middot;</div>
	<div> Sun 05 Jul </div>
</div>
<div class="px-4 py-2 d-lg-flex align-items-center justify-content-start border-top bg-secondary">
	<a href="https://www.volleyballnsw.com.au/games/00000/00000/round/8"><b> Round 8 </b></a>
	<div class="d-none d-lg-inline-block mx-2">&middot;</div>
	<div> Sun 19 Jul </div>
</div>
<div class="px-4 py-2 d-lg-flex align-items-center justify-content-start border-top ">
	<a href="https://www.volleyballnsw.com.au/games/00000/00000/round/13"><b> Quarter Finals </b></a>
	<div class="d-none d-lg-inline-block mx-2">&middot;</div>
	<div> Sun 23 Aug </div>
</div>`;

const gameCard = (teams: string, date = 'Sun 16 Aug 2026') => `
<div class="card card-hover mb-4">
	<div class="card-body font-size-sm">
		<div class="row align-items-center">
			<div class="col-lg-3">
				<div class="row align-items-center">
					<div class="col-md pb-3 pb-lg-0 text-center text-md-left">
						${date}<br />
						08:00
					</div>
					<div class="col-md pb-3 pb-lg-0 text-center text-md-right text-lg-left">
						<a href="https://www.volleyballnsw.com.au/venues/00000/20212">
							Sydney Olympic Park Sports Halls
						</a>
						<div>Court D - 1</div>
					</div>
				</div>
			</div>
			<div class="col-lg-3 pb-3 pb-lg-0 text-center">${teams}</div>
			<div class="col-md pb-3 pb-lg-0 text-center text-lg-center">
				<div class="text-muted font-size-sm">Duty team</div>
				<a href="https://www.volleyballnsw.com.au/games/team/00000/411818">
					YSVL - Under 15 Boys ACADEMY ONE VOLLEYBALL CLUB A</a>
			</div>
		</div>
	</div>
</div>`;

const UPCOMING = gameCard(`
	<a href="https://www.volleyballnsw.com.au/games/team/00000/411835">ENDEAVOUR VOLLEYBALL CLUB</a>
	<div> vs </div>
	<a href="https://www.volleyballnsw.com.au/games/team/00000/415711">JUST SPIKE IT VOLLEYBALL ACADEMY WHITE</a>`);

const PLAYED = gameCard(
	`
	<a href="https://www.volleyballnsw.com.au/games/team/00000/411833">BLACKTOWN VOLLEYBALL ACADEMY</a>
	<div><b> 3 - 0 </b></div>
	<a href="https://www.volleyballnsw.com.au/games/team/00000/411840">SYDNEY ACERS VOLLEYBALL CLUB</a>`,
	'Sun 10 May 2026'
);

const NOW = new Date('2026-07-16T02:00:00Z'); // Thu 16 Jul 2026, Sydney

describe('parseFixtureDate', () => {
	it('parses a full date', () => {
		expect(parseFixtureDate('Sun 10 May 2026', NOW)).toBe('2026-05-10');
	});

	it('infers the current year when omitted', () => {
		expect(parseFixtureDate('Sun 19 Jul', NOW)).toBe('2026-07-19');
	});

	it('rolls a year-less date forward when it would be far in the past', () => {
		// In November, "Sun 10 Jan" must mean NEXT January, not ten months ago.
		expect(parseFixtureDate('Sun 10 Jan', new Date('2026-11-20T02:00:00Z'))).toBe('2027-01-10');
	});

	it('returns null for junk', () => {
		expect(parseFixtureDate('Details', NOW)).toBeNull();
	});
});

describe('parseRoundIndex', () => {
	it('extracts round numbers, labels and dates (finals labels included)', () => {
		expect(parseRoundIndex(INDEX_HTML, NOW)).toEqual([
			{ n: 7, round: 'Round 7', date: '2026-07-05' },
			{ n: 8, round: 'Round 8', date: '2026-07-19' },
			{ n: 13, round: 'Quarter Finals', date: '2026-08-23' }
		]);
	});
});

describe('parseRoundGames', () => {
	it('parses an upcoming game card with home, away and duty teams', () => {
		const [g] = parseRoundGames(UPCOMING, NOW);
		expect(g).toEqual({
			date: '2026-08-16',
			time: '8am',
			venue: 'Sydney Olympic Park Sports Halls',
			court: 'Court D1',
			home: 'ENDEAVOUR VOLLEYBALL CLUB',
			away: 'JUST SPIKE IT VOLLEYBALL ACADEMY WHITE',
			duty: 'YSVL - Under 15 Boys ACADEMY ONE VOLLEYBALL CLUB A',
			played: false
		});
	});

	it('marks a card with a score as played', () => {
		const [g] = parseRoundGames(PLAYED, NOW);
		expect(g.played).toBe(true);
		expect(g.home).toBe('BLACKTOWN VOLLEYBALL ACADEMY');
		expect(g.date).toBe('2026-05-10');
	});
});

// Trimmed real pointscore-table markup — rank has a trailing dot; columns are
// rank | team | played | points | (wins, losses, … ignored).
const STANDINGS_HTML = `
<table class="table table-hover font-size-sm mb-0">
	<thead><tr><th>Rank</th><th>Team name</th><th>Played</th><th><b>Points</b></th><th>Wins</th></tr></thead>
	<tbody>
		<tr>
			<td class="border-bottom "> 1. </td>
			<td class="border-bottom "> SYDNEY ACERS VOLLEYBALL CLUB </td>
			<td class="border-bottom text-right"> 8 </td>
			<td class="border-bottom text-right"> 24 </td>
			<td class="border-bottom text-right"> 8 </td>
		</tr>
		<tr>
			<td class="border-bottom "> 2. </td>
			<td class="border-bottom "> BLACKTOWN VOLLEYBALL ACADEMY </td>
			<td class="border-bottom text-right"> 8 </td>
			<td class="border-bottom text-right"> 21 </td>
			<td class="border-bottom text-right"> 7 </td>
		</tr>
	</tbody>
</table>`;

describe('parseStandings', () => {
	it('parses rank (trailing dot), team, played and points', () => {
		expect(parseStandings(STANDINGS_HTML)).toEqual([
			{ rank: 1, team: 'SYDNEY ACERS VOLLEYBALL CLUB', played: 8, points: 24 },
			{ rank: 2, team: 'BLACKTOWN VOLLEYBALL ACADEMY', played: 8, points: 21 }
		]);
	});

	it('returns empty for a page without the table', () => {
		expect(parseStandings('<div>no table here</div>')).toEqual([]);
	});
});

describe('weekendDates', () => {
	it('finds the upcoming Sat+Sun from a Friday', () => {
		// Fri 17 Jul 2026 Sydney
		expect(weekendDates(new Date('2026-07-17T02:00:00Z'))).toEqual(['2026-07-18', '2026-07-19']);
	});

	it('uses the current Sat when already Saturday', () => {
		expect(weekendDates(new Date('2026-07-18T02:00:00Z'))).toEqual(['2026-07-18', '2026-07-19']);
	});

	it('survives the spring-forward DST weekend from a late-night ref', () => {
		// Fri 2 Oct 2026 23:30 AEST (+10). Sun 4 Oct is the 23h spring-forward
		// day — naive instant+24h from Saturday 23:30 would land on Monday.
		expect(weekendDates(new Date('2026-10-02T13:30:00Z'))).toEqual(['2026-10-03', '2026-10-04']);
	});
});
