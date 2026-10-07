/**
 * The filing replay's made up person: Alex, a secondary school science
 * teacher who lives with their partner Jo, runs, and keeps an allotment.
 * Four Worlds, three Chapters and sixty drops, among them the traps the plan
 * asks for: drops that name the trip's city and are about work, drops that
 * look back on a closed Chapter and drops that only share its subject, and
 * drops that fit nothing. Every name, place and item is made up.
 *
 * The right answers are not here. Two labellers who saw only LABEL_GUIDE.md
 * set them blind, and an adjudicator settled where they split
 * (data/gold.json).
 */

export const TODAY = '2026-10-07';

export const PERSON = { first_name: 'Alex', pronouns: 'they/them' };

export const WORLDS = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    name: 'Teaching',
    description: 'Alex teaches science at Hillside secondary school: classes, marking, colleagues and the school year.',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    name: 'Home and family',
    description: 'Life at home with Jo, the flat, family on both sides and time away together.',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000003',
    name: 'Running',
    description: 'Training, the Tuesday run club and races through the year.',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000004',
    name: 'The allotment',
    description: 'Plot 14 at the Moorside allotments: growing vegetables through the seasons.',
  },
];

export const CHAPTERS = [
  {
    id: 'b0000000-0000-4000-8000-000000000001',
    title: 'Lisbon at half term',
    description: 'A week away with Jo in Lisbon over the October half term.',
    primary_world_id: WORLDS[1].id,
    phase: 'upcoming',
    start_date: '2026-10-24',
    end_date: '2026-10-31',
  },
  {
    id: 'b0000000-0000-4000-8000-000000000002',
    title: 'Year 11 mock exams',
    description: 'Setting, running and marking the Year 11 science mocks.',
    primary_world_id: WORLDS[0].id,
    phase: 'active',
    start_date: '2026-10-05',
    end_date: '2026-11-20',
  },
  {
    id: 'b0000000-0000-4000-8000-000000000003',
    title: 'Leeds half marathon',
    description: 'Training for and running the Leeds half marathon.',
    primary_world_id: WORLDS[2].id,
    phase: 'closed',
    start_date: '2026-06-01',
    end_date: '2026-09-20',
  },
];

/**
 * One life context, as live accounts have: filed into as before until the old
 * Worlds fields stop. The gold set does not judge it; the replay reports it.
 */
export const CONTEXTS = [
  {
    id: 'c0000000-0000-4000-8000-000000000001',
    name: 'The school term',
    kind: 'constraint',
    description: 'Term dates and the school week shape when Alex is free.',
  },
];

/** What Alex placed themselves, shown to filing as their sense of each place. */
export const PLACED = {
  worlds: [
    [WORLDS[3].id, ['Order seed potatoes for spring', 'Water the leeks']],
    [WORLDS[0].id, ['Print the Year 9 worksheets']],
  ],
  chapters: [[CHAPTERS[0].id, ['Book the flights to Lisbon']]],
};

const d = (n, type, title, text, date) => ({
  id: `d${String(n).padStart(2, '0')}`,
  entity_type: type,
  title,
  text,
  date,
});

export const DROPS = [
  d(1, 'todo', 'Set the chemistry mock paper', 'Set the Year 11 chemistry mock paper and send it to the exams office by Friday', '2026-10-06'),
  d(2, 'todo', 'Book the hall for the mocks', 'Ask the exams officer to book the main hall for the mock week', '2026-10-01'),
  d(3, 'todo', 'Mark physics mocks', 'Mark the Year 11 physics mock papers before the department meeting', '2026-10-07'),
  d(4, 'note', 'Revision plan', 'Year 11 need a revision timetable before the mocks, start with forces and electricity', '2026-10-03'),
  d(5, 'todo', 'Parents evening', 'Parents evening on Thursday, print the Year 8 grade sheets', '2026-10-05'),
  d(6, 'todo', 'Order lab goggles', 'Order thirty new pairs of lab goggles for the chemistry lab', '2026-09-29'),
  d(7, 'todo', 'Plan circuits lesson', 'Plan the Year 8 lesson on series and parallel circuits', '2026-10-06'),
  d(8, 'todo', 'Email the Lisbon partner school', 'Email the partner school in Lisbon about next summer\'s science exchange visit for Year 10', '2026-10-02'),
  d(9, 'note', 'Staff room chat', 'Priya says the new head of science starts in January, worth asking her about the timetable', '2026-10-04'),
  d(10, 'todo', 'Cover for Monday', 'Leave cover work for my Monday classes while I am on the course', '2026-10-07'),
  d(11, 'todo', 'Science club', 'Find a volunteer to help run the Wednesday science club', '2026-09-30'),
  d(12, 'todo', 'Reports', 'Write the Year 9 progress reports by the end of the month', '2026-10-01'),
  d(13, 'note', 'Mock results worry', 'A few of my Year 11s are panicking about the mocks, talk to their tutors', '2026-10-07'),
  d(14, 'todo', 'Book a Lisbon museum for the class trip idea', 'Look up whether the science museum in Lisbon does school group bookings, for a Year 10 trip one day', '2026-10-03'),
  d(15, 'todo', 'Airport transfer', 'Book the transfer from Lisbon airport to the apartment for the 24th', '2026-10-05'),
  d(16, 'todo', 'Buy euros', 'Get some euros before half term', '2026-10-04'),
  d(17, 'todo', 'Travel adapter', 'Find the travel adapter and pack it with the chargers', '2026-10-06'),
  d(18, 'todo', 'Restaurant for Jo', 'Find somewhere nice in Alfama for dinner on Jo\'s birthday while we are away', '2026-10-02'),
  d(19, 'todo', 'Check passports', 'Check both passports are still valid for the trip', '2026-09-28'),
  d(20, 'note', 'Things to see', 'Jo wants the tiled museum and a tram ride, I want the oceanarium', '2026-10-01'),
  d(21, 'todo', 'Fix the tap', 'Fix the dripping bathroom tap, need a new washer', '2026-10-03'),
  d(22, 'todo', 'Sunday lunch', 'Call Jo\'s mum about Sunday lunch at theirs', '2026-10-06'),
  d(23, 'todo', 'Council tax', 'Pay the council tax bill online', '2026-09-30'),
  d(24, 'todo', 'Card for Jo\'s dad', 'Buy a birthday card for Jo\'s dad, his birthday is the 15th', '2026-10-05'),
  d(25, 'note', 'Flat', 'We really need to sort the spare room before winter, it is full of boxes', '2026-09-27'),
  d(26, 'todo', 'Cat sitter', 'Ask Sam next door to feed the cat while we are in Lisbon', '2026-10-06'),
  d(27, 'note', 'Jo\'s 40th', 'Want to plan a surprise party for Jo\'s 40th in March, maybe a weekend away with friends', '2026-10-07'),
  d(28, 'todo', 'Long run', 'Long run on Sunday, 12 miles along the canal', '2026-10-04'),
  d(29, 'todo', 'New trainers', 'Buy new trainers, the old ones are worn through', '2026-10-01'),
  d(30, 'habit', 'Run club', 'Tuesday run club at six', '2026-09-26'),
  d(31, 'note', 'Leeds half', 'Still buzzing about the Leeds half, 1:52 was my best time and the last mile was brutal', '2026-09-22'),
  d(32, 'note', 'What I learned from Leeds', 'Looking back at the Leeds half: I went out too fast and should have taken a gel at mile 8', '2026-09-25'),
  d(33, 'todo', 'Sign up for Manchester', 'Sign up for the Manchester marathon in April before the price goes up', '2026-10-03'),
  d(34, 'todo', 'Race photos', 'Download my race photos from the Leeds half before the link expires', '2026-09-24'),
  d(35, 'todo', 'Half marathon in spring', 'Find a spring half marathon to beat my Leeds time', '2026-10-05'),
  d(36, 'todo', 'Foam roller', 'Order a foam roller for after long runs', '2026-09-29'),
  d(37, 'todo', 'Running in Lisbon', 'Plan a couple of morning runs along the river while we are in Lisbon', '2026-10-06'),
  d(38, 'todo', 'Plant garlic', 'Plant the garlic at the plot before the first frost', '2026-10-02'),
  d(39, 'todo', 'Shed lock', 'Fix the lock on the shed at the allotment', '2026-09-30'),
  d(40, 'todo', 'Harvest squashes', 'Harvest the last squashes and store them in the garage', '2026-10-04'),
  d(41, 'note', 'Committee', 'Allotment committee wants everyone to clear their paths by November', '2026-10-01'),
  d(42, 'todo', 'Manure', 'Order a load of manure for the beds over winter', '2026-10-05'),
  d(43, 'todo', 'Veg for the staff room', 'Take the spare courgettes from the plot into the staff room on Monday', '2026-10-06'),
  d(44, 'note', 'Plot plans', 'Next year I want to try growing sweetcorn and more beans', '2026-09-28'),
  d(45, 'todo', 'Car insurance', 'Renew the car insurance, compare quotes first', '2026-10-02'),
  d(46, 'note', 'Podcast', 'Look up that podcast about Roman history someone mentioned', '2026-10-03'),
  d(47, 'todo', 'Library books', 'Return the library books by Saturday', '2026-10-04'),
  d(48, 'todo', 'Dentist', 'Dentist appointment Thursday at 4', '2026-10-05'),
  d(49, 'note', 'Pottery', 'Thinking about doing an evening pottery course in the new year', '2026-10-06'),
  d(50, 'todo', 'Streaming', 'Cancel the streaming subscription we never use', '2026-09-29'),
  d(51, 'todo', 'Portuguese', 'Learn a few Portuguese phrases on the app before we go', '2026-10-03'),
  d(52, 'todo', 'Book club present', 'Get a present for Maya from book club, she is moving away', '2026-10-06'),
  d(53, 'todo', 'Run to school', 'Run to school on Friday and shower there before registration', '2026-10-05'),
  d(54, 'note', 'Tired', 'Really tired this week, need an early night', '2026-10-06'),
  d(55, 'todo', 'Exam board training', 'Book onto the exam board training for the new chemistry spec', '2026-10-01'),
  d(56, 'todo', 'Packing list', 'Write a packing list for Lisbon including sun cream and the guidebook', '2026-10-07'),
  d(57, 'todo', 'Mock invigilators', 'Ask the cover team for invigilators for the mock exams week', '2026-10-06'),
  d(58, 'todo', 'Allotment in Lisbon week', 'Ask Pat on the next plot to water the greenhouse while we are away', '2026-10-06'),
  d(59, 'note', 'Leeds half memory', 'Jo cried at the finish line of the Leeds half, I will never forget that', '2026-09-21'),
  d(60, 'todo', 'Grandad\'s birthday', 'Visit grandad for his 90th, take the photo album', '2026-10-02'),
];
