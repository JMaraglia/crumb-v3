// tools/website-demo/seed.js — MADE-UP, industry-neutral demo data for the website screenshots and demo video
// (founder rule: no food-centric names, nothing from his real CRM; 555 phone numbers; invented businesses).
// "Today" is fixed by the screenshot script (Thu Nov 12, 2026), so dates here are relative to it.
// Not part of the app build.
export function websiteDemo(today = new Date(2026, 10, 12)) {
  const t = today;
  const k = (n) => { const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const ts = (n, h, m = 0) => new Date(t.getFullYear(), t.getMonth(), t.getDate() + n, h, m).toLocaleString();
  const ago = (days) => new Date(t.getFullYear(), t.getMonth(), t.getDate() - days, 9).getTime(); // id = when it was added

  const customers = [
    { id: 1, name: 'Ashgrove Builders', accountNumber: 'AC123456', street: '123 Main St', town: 'Ashford', state: 'OH', zip: '43346', address: '123 Main St, Ashford, OH 43346', website: 'www.ashgrovebuilders.com',
      contacts: [
        { title: 'Purchasing', name: 'John Smith', phone: '5085551234', textPhone: '7745550101', email: 'john@ashgrovebuilders.com' },
        { title: 'GM', name: 'Sarah Lee', phone: '5085555678', textPhone: '', email: 'sarah@ashgrovebuilders.com' },
      ],
      visitDays: ['Thu'], visitTime: 540, visitFrequency: 'weekly', deliveryDays: ['Mon', 'Fri'], callTime: 480, onlineOrdering: true, callNote: 'Text John before 8. He’s in meetings after.',
      notes: [
        { text: 'Family-owned since 1998. John makes the buying decisions.', category: 'Background', timestamp: ts(-60, 9) },
        { text: 'Second location opening in December. Wants pricing for both.', category: 'Visit', timestamp: ts(-1, 11, 20) },
        { text: 'Send updated pricing to John', category: 'Follow-up', done: false, due: k(0), timestamp: ts(-1, 11, 25) },
        { text: 'Drop off the new catalog', category: 'Follow-up', done: false, due: k(1), timestamp: ts(-1, 11, 30) },
      ] },
    { id: 2, name: 'Brinehouse Logistics', accountNumber: 'AC100902', street: '2 Water St', town: 'Seabright', state: 'OH', zip: '43738', address: '2 Water St, Seabright, OH 43738',
      contacts: [{ title: 'Operations', name: 'Pete Alves', phone: '4195550131', textPhone: '', email: 'pete@brinehouselogistics.com' }],
      visitDays: ['Thu'], visitTime: 840, visitFrequency: 'weekly', deliveryDays: ['Fri', 'Sat'], callTime: 570, onlineOrdering: false, callNote: 'Usually orders by 9:30.', notes: [] },
    { id: 3, name: 'Ferro Industrial Supply', accountNumber: 'AC100777', street: '10 Bay St', town: 'Millbrook', state: 'OH', zip: '43720', address: '10 Bay St, Millbrook, OH 43720',
      contacts: [{ title: 'Owner', name: 'Maria Rossi', phone: '6145550177', textPhone: '', email: 'maria@ferroindustrial.com' }],
      visitDays: ['Thu'], visitTime: 630, visitFrequency: 'weekly', deliveryDays: ['Fri'], callTime: 540, onlineOrdering: true, callNote: 'Send updated price sheet.', notes: [] },
    { id: 4, name: 'Juniper Street Dental', accountNumber: 'AC100845', street: '18 Juniper St', town: 'Riverton', state: 'OH', zip: '43350', address: '18 Juniper St, Riverton, OH 43350',
      contacts: [{ title: 'Office Manager', name: 'Lindsay Carter', phone: '3305550164', textPhone: '3305550165', email: '' }],
      visitDays: ['Fri'], visitTime: 630, visitFrequency: 'weekly', deliveryDays: ['Fri'], callTime: 600, onlineOrdering: false, callNote: 'Follow up on the demo.', notes: [] },
    { id: 5, name: 'Kettlemark Print & Sign', accountNumber: 'AC100915', street: '450 Main St', town: 'Kingsbridge', state: 'OH', zip: '43302', address: '450 Main St, Kingsbridge, OH 43302',
      contacts: [{ title: 'Manager', name: 'Kevin Doyle', phone: '6145550118', textPhone: '', email: '' }],
      visitDays: ['Tue'], visitTime: 600, visitFrequency: 'weekly', deliveryDays: ['Wed'], callTime: 510, onlineOrdering: true, callNote: 'Ask about the spring promo.', notes: [] },
    { id: ago(35), name: 'Northgate Auto Group', accountNumber: 'AC100933', street: '77 Broadway', town: 'Riverton', state: 'OH', zip: '43350', address: '77 Broadway, Riverton, OH 43350',
      contacts: [{ title: 'Service Manager', name: 'Rob Mendes', phone: '3305550190', textPhone: '', email: '' }],
      visitDays: [], visitFrequency: 'weekly', deliveryDays: ['Wed'], callTime: 660, onlineOrdering: false, callNote: '', notes: [] },
  ];
  const northgate = customers[5].id;

  const prospects = [
    { id: 11, name: 'Quillfeather Studio', group: 'Quillfeather Studio', stage: 'hot', street: '85 Centre St', town: 'Kingsbridge', state: 'OH', zip: '43302', address: '85 Centre St, Kingsbridge, OH 43302',
      contacts: [{ title: 'Owner', name: 'Dana Price', phone: '5085867788', textPhone: '', email: 'dana@quillfeatherstudio.com' }],
      deliveryDays: ['Thu'], visitTime: 720, visitFrequency: 'weekly', visitLength: 30,
      notes: [
        { text: 'Opened 2 years ago. Buying from a competitor right now.', category: 'Background', timestamp: ts(-20, 10) },
        { text: 'Liked our service plan. Wants a demo for her team.', category: 'Visit', timestamp: ts(-2, 12, 15) },
        { text: 'Send the proposal by Friday', category: 'Follow-up', done: false, due: k(2), timestamp: ts(-2, 12, 20) },
      ] },
    { id: 12, name: 'Quillfeather Studio', group: 'Quillfeather Studio', stage: 'hot', street: '40 River Rd', town: 'Riverton', state: 'OH', zip: '43350', address: '40 River Rd, Riverton, OH 43350',
      contacts: [], deliveryDays: [], visitFrequency: 'weekly', notes: [] },
    { id: 13, name: 'Quillfeather Studio', group: 'Quillfeather Studio', stage: 'hot', street: '9 Elm St', town: 'Elmwood', state: 'OH', zip: '43360', address: '9 Elm St, Elmwood, OH 43360',
      contacts: [], deliveryDays: [], visitFrequency: 'weekly', notes: [] },
    { id: 14, name: 'Halyard Marine Services', stage: 'ready', street: '5 Birch St', town: 'Pine Hollow', state: 'OH', zip: '43347', address: '5 Birch St, Pine Hollow, OH 43347',
      contacts: [{ title: 'GM', name: 'Erin Cole', phone: '4195550109', textPhone: '', email: 'erin@halyardmarine.com' }],
      deliveryDays: ['Thu'], visitTime: 930, visitFrequency: 'weekly',
      notes: [{ text: 'Send credit application', category: 'Follow-up', done: false, due: k(-1), timestamp: ts(-3, 16) }] },
    { id: 15, name: 'Copper Bell Fitness', stage: 'warm', street: '300 Union St', town: 'North Avalon', state: 'OH', zip: '43310', address: '300 Union St, North Avalon, OH 43310',
      contacts: [{ title: 'Owner', name: 'Tasha Greene', phone: '6145550123', textPhone: '', email: '' }], deliveryDays: ['Fri'], visitTime: 600, visitFrequency: 'weekly',
      notes: [{ text: 'Interested once their lease renews in January.', category: 'Visit', timestamp: ts(-6, 10, 30) }] },
    { id: ago(52), name: 'Harbor Light Hotel', stage: 'warming', street: '1 Harbor Way', town: 'Seabright', state: 'OH', zip: '43738', address: '1 Harbor Way, Seabright, OH 43738',
      contacts: [], deliveryDays: [], visitFrequency: 'weekly', notes: [] },
    { id: 17, name: 'Ironwood Property Mgmt', stage: 'cold', street: '12 Pleasant St', town: 'Port Mercer', state: 'OH', zip: '43380', address: '12 Pleasant St, Port Mercer, OH 43380',
      contacts: [], deliveryDays: [], visitFrequency: 'weekly',
      notes: [{ text: 'Left a card with the front desk.', category: 'Contacted', timestamp: ts(-9, 14) }] },
    { id: ago(41), name: 'Larkspur Salon & Spa', stage: 'warm', street: '4 Main St', town: 'Elmwood', state: 'OH', zip: '43360', address: '4 Main St, Elmwood, OH 43360',
      contacts: [], deliveryDays: [], visitFrequency: 'weekly', notes: [] },
  ];

  const events = [
    { id: 901, title: 'Lunch with District Manager', date: k(0), start: 750, end: 810, color: '#5856d6', location: 'Elmwood Office', showInItinerary: true },
    { id: 902, title: 'Product demo at Quillfeather', date: k(1), start: 840, end: 900, color: '#34c759', location: '85 Centre St, Kingsbridge, OH 43302', accountType: 'prospect', accountId: 11, accountName: 'Quillfeather Studio' },
    { id: 903, title: 'Team meeting', date: k(-1), start: 480, end: 540, color: '#5856d6', location: '' },
    { id: 904, title: 'Quarterly review', date: k(6), start: 600, end: 660, color: '#0077cc', location: '' },
  ];

  return {
    crumb_contacts: JSON.stringify(customers),
    crumb_prospects: JSON.stringify(prospects),
    crumb_calendar_events: JSON.stringify(events),
    visitData: JSON.stringify([]),
    crumb_itinerary_done: JSON.stringify({ [k(0)]: ['c-1'] }),
    crumb_itinerary_locks: JSON.stringify({ [k(0)]: { 'c-1': 540, 'e-901': 750 } }),
    crumb_todos: JSON.stringify([
      { id: 1, text: 'Expense report', due: k(0), done: false },
      { id: 2, text: 'Update the price sheet', due: k(5), done: false },
      { id: 3, text: 'Call Rob back about the quote', due: k(1), done: false, accountType: 'customer', accountId: northgate, accountName: 'Northgate Auto Group' },
    ]),
    crumb_calendar_settings: JSON.stringify({ eventLength: 60, startHour: 7, showVisits: true, showStops: true, defaultColor: '#34c759' }),
    crumb_callsheet_ordered: JSON.stringify({ [k(0)]: [1, 3, 'no:4'] }),
    crumb_notify_settings: JSON.stringify({ enabled: true }),
    crumb_last_backup: new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1, 18).toISOString(), // plain text
  };
}
