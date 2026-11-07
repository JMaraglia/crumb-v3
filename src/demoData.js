// file: src/demoData.js
// MADE-UP demo data for the sync TEST COPY (sync step S3). No real businesses or people: invented names,
// 555-style phone numbers, example.com emails. Dates are relative to today so it always looks current.
// Only ever loaded into an EMPTY copy of Crumb (see syncSend.js → loadDemoData).
export function demoData() {
  const t = new Date();
  const k = (n) => { const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const ts = (n, h, m = 0) => new Date(t.getFullYear(), t.getMonth(), t.getDate() + n, h, m).toLocaleString();
  const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const D = (n) => dow[new Date(t.getFullYear(), t.getMonth(), t.getDate() + n).getDay()];
  const today = D(0), tmr = D(1), day2 = D(2);
  const customers = [
    { id: 1, name: 'Charred Oak Tavern', accountNumber: '100123456', street: '123 Main St', town: 'Middleboro', state: 'MA', zip: '02346', address: '123 Main St, Middleboro, MA 02346', website: 'www.example.com',
      contacts: [{ title: 'Chef', name: 'John Smith', phone: '5085551234', textPhone: '7745550101', email: 'john@example.com' }, { title: 'GM', name: 'Sarah Lee', phone: '5085555678', textPhone: '', email: 'sarah@example.com' }],
      visitDays: [today], visitTime: 540, fixedTime: true, visitFrequency: 'weekly', visitLength: 45, deliveryDays: [tmr, 'Mon'], callTime: 480, onlineOrdering: true, callNote: 'Text John before 8. He’s on the line after.',
      notes: [
        { text: 'Family-owned since 1998. Chef John makes the buying decisions.', category: 'Background', timestamp: ts(-40, 9) },
        { text: 'Raw bar opening in December. Wants oyster and littleneck pricing.', category: 'Visit', timestamp: ts(-1, 11, 20) },
        { text: 'Send oyster pricing to John', category: 'Follow-up', done: false, due: k(0), timestamp: ts(-1, 11, 25) },
        { text: 'Drop off buffalo wing sauce samples', category: 'Sample', done: false, due: k(1), timestamp: ts(-1, 11, 30) },
        { text: 'Order up 12% this month. Happy with the new fry oil.', category: 'General', timestamp: ts(-6, 15) },
      ] },
    { id: 2, name: 'Bella Pizza', accountNumber: '100777', street: '10 Bay St', town: 'Fall River', state: 'MA', zip: '02720', address: '10 Bay St, Fall River, MA 02720',
      contacts: [{ title: 'Owner', name: 'Maria Rossi', phone: '7742233374', textPhone: '', email: 'maria@example.com' }],
      visitDays: [today], visitTime: 630, visitFrequency: 'weekly', deliveryDays: [tmr, 'Fri'], callTime: 'na', onlineOrdering: true, callNote: 'Orders online. Only call if out of stock.',
      notes: [{ text: 'Switching cheese suppliers, wants a 50 lb sample of whole-milk mozz.', category: 'Visit', timestamp: ts(-7, 10, 40) }] },
    { id: 3, name: 'Lindsay’s Diner', accountNumber: '100845', street: '18 County Rd', town: 'Lakeville', state: 'MA', zip: '02347', address: '18 County Rd, Lakeville, MA 02347',
      contacts: [{ title: 'Owner', name: 'Lindsay Carter', phone: '5089471200', textPhone: '5089471201', email: '' }],
      visitDays: [tmr], visitTime: 630, visitFrequency: 'weekly', deliveryDays: [tmr], callTime: 540, onlineOrdering: false, callNote: 'Ask about the breakfast special.', notes: [] },
    { id: 4, name: 'Sippican Seafood Shack', accountNumber: '100902', street: '2 Water St', town: 'Marion', state: 'MA', zip: '02738', address: '2 Water St, Marion, MA 02738',
      contacts: [{ title: 'Chef', name: 'Pete Alves', phone: '5087485500', textPhone: '', email: 'pete@example.com' }],
      visitDays: [today], visitTime: 840, visitFrequency: 'weekly', deliveryDays: [tmr, 'Sat'], callTime: 600, onlineOrdering: true, callNote: '', notes: [] },
    { id: 5, name: 'Brockton Bagel Co.', accountNumber: '100915', street: '450 Main St', town: 'Brockton', state: 'MA', zip: '02301', address: '450 Main St, Brockton, MA 02301',
      contacts: [{ title: 'Manager', name: 'Kevin Doyle', phone: '5085801010', textPhone: '', email: '' }],
      visitDays: [day2], visitTime: 480, visitFrequency: 'weekly', deliveryDays: [tmr], callTime: 450, onlineOrdering: false, callNote: 'Early riser. Call before 8.', notes: [] },
    { id: 6, name: 'Taunton Grille', accountNumber: '100933', street: '77 Broadway', town: 'Taunton', state: 'MA', zip: '02780', address: '77 Broadway, Taunton, MA 02780',
      contacts: [{ title: 'Kitchen Mgr', name: 'Rob Mendes', phone: '5088223000', textPhone: '', email: '' }],
      visitDays: ['Mon'], visitTime: 600, visitFrequency: 'weekly', deliveryDays: ['Mon', tmr], callTime: 600, onlineOrdering: false, callNote: '', notes: [] },
  ];
  const prospects = [
    { id: 11, name: 'Home Cafe', stage: 'hot', street: '85 Centre St', town: 'Brockton', state: 'MA', zip: '02302', address: '85 Centre St, Brockton, MA 02302',
      contacts: [{ title: 'Owner', name: 'Dana Price', phone: '5085867788', textPhone: '', email: 'dana@example.com' }],
      deliveryDays: [today], visitTime: 720, visitFrequency: 'weekly', visitLength: 30,
      notes: [
        { text: 'Opened 2 years ago. Buying from a cash-and-carry right now.', category: 'Background', timestamp: ts(-20, 10) },
        { text: 'Loved our coffee program. Wants a tasting for her staff.', category: 'Visit', timestamp: ts(-2, 12, 15) },
        { text: 'Bring coffee samples for the tasting', category: 'Follow-up', done: false, due: k(2), timestamp: ts(-2, 12, 20) },
      ] },
    { id: 12, name: 'Nelly Rose Diner', stage: 'warm', street: '1 Chase Rd', town: 'East Freetown', state: 'MA', zip: '02717', address: '1 Chase Rd, East Freetown, MA 02717',
      contacts: [{ title: 'Owner', name: 'Rose Medeiros', phone: '5087630011', textPhone: '', email: '' }], deliveryDays: [tmr], visitTime: 600, visitFrequency: 'weekly',
      notes: [{ text: 'Visited today. Nobody there. Try mid-morning.', category: 'Visit', timestamp: ts(-7, 14, 40) }] },
    { id: 13, name: 'Lakeside Grill & Bar', stage: 'ready', street: '5 Bedford St', town: 'Lakeville', state: 'MA', zip: '02347', address: '5 Bedford St, Lakeville, MA 02347',
      contacts: [{ title: 'GM', name: 'Tony Silva', phone: '5089239090', textPhone: '', email: 'tony@example.com' }], deliveryDays: [], visitFrequency: 'weekly',
      notes: [{ text: 'Send credit application', category: 'Follow-up', done: false, due: k(-1), timestamp: ts(-3, 16) }] },
    { id: 14, name: 'The Copper Kettle', stage: 'cold', street: '300 Union St', town: 'New Bedford', state: 'MA', zip: '02740', address: '300 Union St, New Bedford, MA 02740', contacts: [], deliveryDays: [], visitFrequency: 'weekly', notes: [] },
    { id: 15, name: 'Marion Yacht Club Kitchen', stage: 'warming', street: '4 Main St', town: 'Marion', state: 'MA', zip: '02738', address: '4 Main St, Marion, MA 02738', contacts: [], deliveryDays: [], visitFrequency: 'weekly', notes: [] },
    { id: 16, name: 'Rosie’s Bakery', stage: 'warm', street: '12 Pleasant St', town: 'Bridgewater', state: 'MA', zip: '02324', address: '12 Pleasant St, Bridgewater, MA 02324', contacts: [], deliveryDays: [], visitFrequency: 'weekly', notes: [] },
  ];
  return {
    crumb_contacts: JSON.stringify(customers),
    crumb_prospects: JSON.stringify(prospects),
    crumb_calendar_events: JSON.stringify([
    { id: 901, title: 'Lunch with District Manager', date: k(0), start: 750, end: 810, color: '#5856d6', location: 'Bridgewater Office', showInItinerary: true },
    { id: 902, title: 'Coffee tasting at Home Cafe', date: k(1), start: 840, end: 900, color: '#34c759', location: '85 Centre St, Brockton, MA 02302', accountType: 'prospect', accountId: 11, accountName: 'Home Cafe', notes: 'Bring 3 roasts and the cold brew kit.' },
    { id: 903, title: 'Food show prep', date: k(2), start: 540, end: 600, color: '#ff9500', location: '' },
    { id: 904, title: 'Team meeting', date: k(-1), start: 480, end: 540, color: '#5856d6', location: '' },
  ]),
    visitData: JSON.stringify([{ id: 501, name: 'Lakeside Grill & Bar', date: k(0), time: '15:30', done: false, recurrence: 'none', type: 'prospect', accountType: 'prospect', accountId: 13 }]),
    crumb_itinerary_done: JSON.stringify({ [k(0)]: ['c-1'] }),
    crumb_todos: JSON.stringify([
    { id: 1, text: 'Expense report', due: k(0), done: false },
    { id: 2, text: 'Order a new samples bag', due: k(5), done: false },
    { id: 3, text: 'Call Rob back about the fryer oil', due: k(1), done: false, accountType: 'customer', accountId: 6, accountName: 'Taunton Grille' },
  ]),
    crumb_calendar_settings: JSON.stringify({ eventLength: 60, startHour: 7, showVisits: true, showStops: true, defaultColor: '#34c759', colorNames: { '#34c759': 'Prospect meeting', '#5856d6': 'Company meeting', '#0077cc': 'Customer meeting' } }),
    crumb_callsheet_ordered: JSON.stringify({ [k(0)]: [1, 5, 4] }),
  };
}
