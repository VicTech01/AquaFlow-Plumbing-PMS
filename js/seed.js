'use strict';
/* ================= seed data + AI pricing catalog ================= */

const DEFAULT_TEMPLATES = {
  job_confirm: 'Hi {customer}, your plumbing job "{job}" ({type}) is scheduled for {date} at {time}. Your technician: {tech}. — {business}',
  dispatch: 'Hi {customer}, {tech} is on the way to {address} for "{job}". Expected arrival {time}. — {business}',
  quote_sent: 'Hi {customer}, your quotation {ref} for {total} is ready ({title}). Valid until {valid}. Reply here to discuss or approve. — {business}',
  invoice_sent: 'Hi {customer}, your invoice {ref} for {total} is due on {due}. You can pay via M-Pesa, bank transfer or cash. Thank you! — {business}',
  payment_reminder: 'Hi {customer}, a friendly reminder that invoice {ref} for {balance} was due on {due}. Kindly arrange payment at your earliest convenience. — {business}',
  payment_received: 'Hi {customer}, we received {amount} for invoice {ref}. Thank you for your business! — {business}',
  maintenance_due: 'Hi {customer}, it\'s time for your {equipment} maintenance (last serviced {last}). Let\'s book a slot this week. — {business}',
  job_complete: 'Hi {customer}, the work on "{job}" is complete. Total: {total}. Thanks for choosing {business}!'
};

/* AI estimate catalog: rules model of standard plumbing scopes.
   materials: {n:name, q:qty, p:base price, u:unit, r:rationale, w:assumption warning} */
const AI_CATALOG = [
  { id:'leak-faucet', label:'Leaking tap / faucet repair', hours:1, risk:'If the valve body is corroded, a replacement tap (~KES 2,500–8,500) may be quoted separately after inspection.',
    materials:[{n:'Faucet washer kit',q:1,p:950,u:'kit',r:'Standard seal & cartridge kit'},
               {n:'Tap cartridge (universal)',q:1,p:1400,u:'pcs',r:'Spare cartridge fitted while we\'re in there'}],
    incl:['Water isolation & pressure test','Tidy-up after work'] },
  { id:'leak-pipe', label:'Pipe leak repair (visible)', hours:2, risk:'Concealed/damaged sections beyond the repair point are billed as measured on site.',
    materials:[{n:'PVC pipe 25mm',q:1.5,p:480,u:'m',r:'Section of pipe for the repair'},
               {n:'Push-fit coupling 25mm',q:2,p:220,u:'pcs',r:'Quick, leak-free coupling'},
               {n:'Silicone sealant tube',q:1,p:650,u:'pcs',r:'Re-seal joints'}],
    incl:['Pressure test after repair'] },
  { id:'burst-pipe', label:'Burst pipe / major leak', hours:4, risk:'Emergency rate applies. Structural damage (plaster/flooring) is excluded.',
    materials:[{n:'CPVC pipe 25mm',q:2.5,p:520,u:'m',r:'Replace damaged run'},
               {n:'Push-fit coupling 25mm',q:3,p:220,u:'pcs',r:'Couplings for new section'},
               {n:'Angle valve 3/8',q:2,p:1100,u:'pcs',r:'New isolation points for the future'}],
    incl:['Isolation & damage containment','Pressure test','Drying advice'] },
  { id:'drain-clog', label:'Blocked drain / rodding', hours:1.5, risk:'Severe blockage or grease-laden main may require jetting (quoted separately).',
    materials:[{n:'Drain enzyme gel 500ml',q:1,p:900,u:'pcs',r:'Prevents re-blocking'}],
    incl:['Rodding up to 6m','Flow test'] },
  { id:'toilet-repair', label:'Toilet repair (running / leak)', hours:1.5, risk:'Cracked pan will be quoted as replacement (~KES 12,000–18,000) after inspection.',
    materials:[{n:'Toilet flapper kit',q:1,p:1450,u:'kit',r:'Stops running water'},
               {n:'Wax ring & bolts',q:1,p:800,u:'kit',r:'Base seal replacement'}],
    incl:['Flush & leak test'] },
  { id:'heater-service', label:'Geyser service & descale', hours:2.5, risk:'Element replaced only if testing shows wear — you pay only if fitted.',
    materials:[{n:'Geyser element 2kW',q:1,p:3800,u:'pcs',r:'Replaced only if worn (tested first)'},
               {n:'Anode rod',q:1,p:2200,u:'pcs',r:'Corrosion protection'}],
    incl:['Full descale','Thermostat check','Safety (ELCB) test'] },
  { id:'geyser-install', label:'New geyser 50L — supply & install', hours:5,
    materials:[{n:'Geyser 50L',q:1,p:24500,u:'pcs',r:'Standard 50L instant/cumulative unit'},
               {n:'Anode rod',q:1,p:2200,u:'pcs',r:'Included, pre-fitted'},
               {n:'Check & foot valve',q:1,p:2800,u:'kit',r:'Safety valves per code'}],
    incl:['Removal of old unit','Pressure test','Usage demonstration'] },
  { id:'solar-gw', label:'Solar water heater (300L) — supply & install', hours:8,
    risk:'Roof structural confirmation required. Carry-up / scaffolding billed separately if access is difficult.',
    materials:[{n:'Solar water heater 300L (kit)',q:1,p:65000,u:'kit',r:'300L pre-wired tank, 20 tubes & manifold'},
               {n:'EV200 controller',q:1,p:7500,u:'pcs',r:'Anti-scald valve for mains mixing'},
               {n:'Mounting & piping kit (300L)',q:1,p:9800,u:'kit',r:'Roof trusses, brackets, PPR, insulation, clamps'}],
    incl:['Roof structural check & anchoring','Mains-mixing setup','Pressure & temperature test','12-month workmanship warranty'] },
  { id:'solar-pv', label:'Home solar backup (2–3kW PV system)', hours:12,
    risk:'Final scope depends on load study — extra panels or batteries billed as measured. Commissioning requires power utility notification where applicable.',
    materials:[{n:'3kW hybrid inverter',q:1,p:38000,u:'pcs',r:'Hybrid inverter with MPPT'},
               {n:'Solar PV 250W panel',q:10,p:13500,u:'pcs',r:'~2.5kW of panels (10 × 250W)'},
               {n:'100Ah tubular battery',q:4,p:16800,u:'pcs',r:'24V battery bank (4 × 100Ah)'},
               {n:'Charge controller 60A',q:1,p:9800,u:'pcs',r:'Backup controller / shunt'},
               {n:'Solar cabling & DB pack',q:1,p:18000,u:'kit',r:'MCB board, DC/AC cabling, conduits, earthing'}],
    incl:['Load study','Panel mounting & commissioning','Battery bank wiring','Distribution & earthing','12-month warranty on work'] },
  { id:'bathroom-fit', label:'Bathroom refit — plumbing (1 WC)', hours:18, risk:'Demolition, tiling and labour beyond plumbing excluded. Tiling must be dry before fixture handover.',
    materials:[{n:'Mixer tap (basin)',q:1,p:8500,u:'pcs',r:'Basin mixer'},
               {n:'WC pan & cistern',q:1,p:14500,u:'pcs',r:'Standard close-coupled WC'},
               {n:'Shower column (thermo)',q:1,p:9800,u:'pcs',r:'Thermostatic shower column'},
               {n:'PPR pipe 20mm',q:12,p:420,u:'m',r:'Rough-in pipework'},
               {n:'Bathroom fittings pack',q:1,p:4500,u:'kit',r:'Elbows, nuts, brackets, clamps'},
               {n:'Silicone sealant tube',q:2,p:650,u:'pcs',r:'Sealing & finishes'}],
    incl:['Full rough-in','Fixture installation','Pressure & flow test','Warranty: 12 months workmanship'] },
  { id:'pump-install', label:'Booster / submersible pump install', hours:4,
    materials:[{n:'Submersible pump 1HP',q:1,p:18500,u:'pcs',r:'1HP submersible unit'},
               {n:'Check & foot valve',q:1,p:2800,u:'kit',r:'Prevents backflow & dry-run'}],
    incl:['Wiring check (by licensed electrician where required)','Pressure test'] },
  { id:'septic-jet', label:'Septic jet & drain inspection', hours:3,
    materials:[],
    incl:['Jetting service (per tank)','Camera inspection of main line','Written report with photos'] },
  { id:'gutter-clean', label:'Gutter clean & minor repair', hours:2,
    materials:[{n:'Silicone sealant tube',q:1,p:650,u:'pcs',r:'Seal seams & leaks found'}],
    incl:['Downpipe clearing','Slight re-hanging where loose'] },
  { id:'backflow-test', label:'Backflow preventer test & certify', hours:2.5,
    materials:[],
    incl:['Backflow test rig & gauges','NAWSCA-compliant certificate','Valid for 6 months'] }
];

/* ================= make seed ================= */
function makeSeed(){
  const Y = new Date().getFullYear();
  const D = n => isoDate(addDays(today(), n));
  const P = (name,phone,role,rate,skills) => ({id:uid('t'),name,phone,role,rate,skills,active:true,hoursPerDay:8});
  const C = (name,type,phone,area,address,off=-120) => ({id:uid('c'),name,type,phone,email:'',area,address,notes:[],createdAt:D(off)});
  const item = (kind,desc,qty,unit,price) => ({kind,desc,qty,unit,price});
  const tot = items => Math.round(sum(items,i=>i.qty*i.price)*1.16);

  const customers = [
    C('Wanjiku Kamau','Residential','0712 480 221','Kilimani','24 Arundel Cres, Kilimani',-260),
    C('Muthaiga Specialist Clinic','Commercial','0733 902 415','Muthaiga','Muthaiga Hill Ave 14, Muthaiga',-400),
    C('David Ochieng','Residential','0798 114 650','Lavington','15 Acacia Grove, Lavington',-190),
    C('Karen Country Club','Commercial','0720 664 300','Karen','Karen Rd, Karen',-520),
    C('Amina Hassan','Residential','0711 355 872','Westlands','301 River Rd, Westlands',-90),
    C('The Park Hotel','Commercial','020 284 6000','CBD','Parklands, Nairobi CBD',-600),
    C('Kevin Wairimu','Residential','0735 209 448','Embakasi','Eastleigh Rd 12, Embakasi',-150),
    C('Grace Njeri','Residential','0722 778 913','Runda','7 Runda Ave, Runda',-310),
    C('Sunrise Apartments','Commercial','0701 556 210','CBD','77 Mbiari Kariuki St, CBD',-350),
    C('Peter Mutua','Residential','0745 903 118','Thika','Muthaiga Rd 8, Thika',-60)
  ];
  const [KAMAU,CLINIC,OCHIENG,KAREN,HASSAN,PARK,WAIRIMU,NJERI,SUNRISE,MUTUA] = customers;

  const technicians = [
    P('Brian Otieno','0712 000 111','Senior',1800,['Geyser & heating','Gas & water','Pressure systems','Solar install']),
    P('David Mwangi','0712 000 222','Standard',1200,['Drains & unblocking','Bathroom fit-out','PPR / PVC','Drainage & septic']),
    P('Joseph Kiptoo','0712 000 333','Standard',1200,['Emergency callouts','Pumps & motors','General repairs']),
    P('Sarah Achieng','0712 000 444','Apprentice',900,['General repairs','Assisting senior tech'])
  ];
  const [OTIENO,MWANGI,KIPTOO,ACHIENG] = technicians;

  const job = (n,cust,title,type,priority,status,off,start,hours,techs,extra={}) => Object.assign({
    id:uid('j'), ref:`JOB-${Y}-${pad4(n)}`, customerId:cust.id, title, type, priority, status,
    date:D(off), start, hours, technicianIds:techs.map(t=>t.id), address:cust.address, notes:'', createdAt:D(off-1)
  }, extra);

  const jobs = [
    job(1, OCHIENG,'Mixer tap replacement','Repair','Low','Completed',-6,'10:00',1,[KIPTOO]),
    job(2, CLINIC,'Quarterly maintenance check','Maintenance','Low','Completed',-2,'10:00',2,[OTIENO]),
    job(14,KAMAU,'Kitchen sink & tap replacement','Repair','Medium','Completed',-21,'09:00',3,[MWANGI]),
    job(13,PARK,'Kitchen sink drain slow','Repair','Medium','Completed',-5,'15:00',1.5,[MWANGI]),
    job(12,WAIRIMU,'Submersible pump repair','Repair','High','Completed',-30,'09:00',4,[KIPTOO,ACHIENG]),
    job(3, HASSAN,'Burst pipe under bathroom','Emergency','Urgent','In Progress',0,'08:30',3.5,[KIPTOO,ACHIENG]),
    job(4, NJERI,'Geyser 50L replacement install','Installation','High','Dispatched',0,'11:00',5,[OTIENO]),
    job(5, PARK,'Guest WC blocked — urgent','Repair','High','Dispatched',0,'14:00',1.5,[MWANGI]),
    job(6, SUNRISE,'Backflow preventer test','Inspection','Low','Scheduled',1,'09:00',2.5,[OTIENO]),
    job(7, WAIRIMU,'Booster pump installation','Installation','Medium','Scheduled',1,'13:00',4,[KIPTOO]),
    job(9, KAREN,'Gutter clean before rainy season','Maintenance','Low','Scheduled',2,'09:30',3,[MWANGI]),
    job(8, KAMAU,'Bathroom refit — plumbing','Installation','High','Scheduled',3,'08:00',6,[MWANGI,ACHIENG]),
    job(10,MUTUA,'Toilet running water','Repair','Medium','Scheduled',4,'10:00',1.5,[KIPTOO]),
    job(11,CLINIC,'Boiler low pressure — inspect','Inspection','Medium','Scheduled',5,'09:00',2,[OTIENO]),
    job(15,MUTUA,'Solar water heater 300L — supply & install','Solar','High','Scheduled',6,'08:00',8,[OTIENO])
  ];
  const findJob = t => jobs.find(j=>j.title.includes(t));

  const quote = (n,cust,title,status,off,validOff,items,extra={}) => Object.assign({
    id:uid('q'), ref:`QUO-${Y}-${pad4(n)}`, customerId:cust.id, title, items, discount:0, vatRate:16,
    status, validUntil:D(validOff), notes:'', ai:null, jobId:null, createdAt:D(off)
  }, extra);

  const quotes = [
    quote(5, PARK,'Guest WC unblock & descale','Declined',-8,-1,
      [item('Labor','Unblock & descale — labor',2,'hr',1200),item('Material','Drain enzyme gel 500ml',2,'pcs',900),item('Labor','Travel fee — within-city',1,'trip',400)]),
    quote(3, KAREN,'Gutter clean & minor repair','Approved',-4,5,
      [item('Labor','Gutter clean — labor',3,'hr',1200),item('Material','Silicone sealant tube',1,'pcs',650),item('Labor','Travel fee — outskirts',1,'trip',1200)]),
    quote(1, KAMAU,'Bathroom refit — plumbing (1 WC)','Sent',-1,10,
      [item('Labor','Bathroom refit — labor',18,'hr',1200),item('Material','Mixer tap (basin)',1,'pcs',8500),
       item('Material','WC pan & cistern',1,'pcs',14500),item('Material','Shower column (thermo)',1,'pcs',9800),
       item('Material','PPR pipe 20mm',12,'m',420),item('Material','Bathroom fittings pack',1,'kit',4500),
       item('Material','Silicone sealant tube',2,'pcs',650),item('Labor','Travel fee — within-city',1,'trip',400)],
      {jobId: findJob('Bathroom refit').id}),
    quote(4, NJERI,'Geyser 50L supply & install','Sent',-2,7,
      [item('Labor','Geyser install — labor (senior)',5,'hr',1800),item('Material','Geyser 50L',1,'pcs',24500),
       item('Material','Anode rod',1,'pcs',2200),item('Material','Check & foot valve',1,'kit',2800),
       item('Labor','Travel fee — within-city',1,'trip',400)],
      {jobId: findJob('Geyser 50L').id}),
    quote(2, MUTUA,'Toilet repair — running water','Draft',0,14,
      [item('Labor','Toilet repair — running water',1.5,'hr',1200),item('Material','Toilet flapper kit',1,'kit',1450),
       item('Material','Wax ring & bolts',1,'kit',800),item('Labor','Travel fee — outskirts',1,'trip',1200)]),
    quote(6, MUTUA,'Solar water heater 300L — supply & install','Sent',0,10,
      [item('Labor','Solar water heater 300L — labor (senior)',8,'hr',1800),item('Material','Solar water heater 300L (kit)',1,'kit',65000),
       item('Material','EV200 controller',1,'pcs',7500),item('Material','Mounting & piping kit (300L)',1,'kit',9800),
       item('Labor','Travel fee — outskirts',1,'trip',1200)],
      {jobId: findJob('Solar water heater').id})
  ];

  const invoice = (n,cust,jobId,items,issuedOff,dueOff,payments) => ({
    id:uid('inv'), ref:`INV-${Y}-${pad4(n)}`, customerId:cust.id, jobId, quoteRef:null, items, discount:0, vatRate:16,
    issued:D(issuedOff), due:D(dueOff), payments:payments||[], status:'Open', createdAt:D(issuedOff)
  });

  const invItems = [
    // 1..9
    [item('Labor','Sink replacement — labor',2,'hr',1200),item('Material','P-trap 1.2"',1,'pcs',1200),item('Labor','Travel fee — within-city',1,'trip',400)],
    [item('Labor','Drain rodding (2 lines) — labor',4,'hr',1200),item('Labor','Travel fee — within-city',1,'trip',400)],
    [item('Labor','Annual boiler service — labor',6,'hr',1800),item('Material','Anode rod',1,'pcs',2200),item('Labor','Travel fee — within-city',1,'trip',400)],
    [item('Labor','Geyser element swap — labor',2.5,'hr',1800),item('Material','Geyser element 2kW',1,'pcs',3800),item('Labor','Travel fee — within-city',1,'trip',400)],
    [item('Labor','Pump repair & install — labor',4,'hr',1200),item('Material','Check & foot valve',1,'kit',2800),item('Material','Silicone sealant tube',1,'pcs',650),item('Labor','Travel fee — outskirts',1,'trip',1200)],
    [item('Labor','Sink & tap replacement — labor',3,'hr',1200),item('Material','Mixer tap (basin)',1,'pcs',8500),item('Material','P-trap 1.2"',1,'pcs',1200),item('Labor','Travel fee — within-city',1,'trip',400)],
    [item('Labor','Drain rodding & P-trap — labor',2,'hr',1200),item('Material','P-trap 1.2"',1,'pcs',1200),item('Material','Drain enzyme gel 500ml',2,'pcs',900),item('Material','Silicone sealant tube',1,'pcs',650),item('Labor','Travel fee — within-city',1,'trip',400)],
    [item('Labor','Quarterly preventive maintenance — labor',4,'hr',1800),item('Material','Anode rod',1,'pcs',2200),item('Material','Silicone sealant tube',2,'pcs',650),item('Labor','Inspection & certification',1,'visit',4500),item('Labor','Travel fee — within-city',1,'trip',400)],
    [item('Labor','Emergency callout & labor',3.5,'hr',1680),item('Material','CPVC pipe 25mm',2.5,'m',520),item('Material','Push-fit coupling 25mm',3,'pcs',220),item('Material','Angle valve 3/8',2,'pcs',1100),item('Labor','Travel fee — within-city',1,'trip',400)]
  ];
  const inv7 = tot(invItems[6]);
  const invoices = [
    invoice(1, KAMAU, null, invItems[0], -140, -126, [{date:D(-138),amount:tot(invItems[0]),method:'Cash',note:''}]),
    invoice(2, PARK, null, invItems[1], -112, -98, [{date:D(-105),amount:tot(invItems[1]),method:'M-Pesa',note:'Lipa na M-Pesa'}]),
    invoice(3, CLINIC, null, invItems[2], -88, -74, [{date:D(-80),amount:tot(invItems[2]),method:'Bank transfer',note:'Equity 4028...19'}]),
    invoice(4, NJERI, null, invItems[3], -61, -47, [{date:D(-58),amount:tot(invItems[3]),method:'M-Pesa',note:''}]),
    invoice(5, WAIRIMU, findJob('Submersible pump repair').id, invItems[4], -30, -16, [{date:D(-26),amount:tot(invItems[4]),method:'Cash',note:''}]),
    invoice(6, KAMAU, findJob('Kitchen sink & tap').id, invItems[5], -20, -6, [{date:D(-16),amount:7500,method:'M-Pesa',note:'Partial'}]),
    invoice(7, PARK, findJob('Kitchen sink drain').id, invItems[6], -4, 10, [{date:D(-3),amount:inv7,method:'M-Pesa',note:''}]),
    invoice(8, CLINIC, findJob('Quarterly maintenance').id, invItems[7], -1, 13, []),
    invoice(9, HASSAN, findJob('Burst pipe').id, invItems[8], 0, 14, [])
  ];
  invoices[6].status = 'Open';

  const INV = (name,sku,category,unit,qty,reorder,cost,price,location,history=[]) => ({id:uid('i'),name,sku,category,unit,qty,reorder,cost,price,location,history});
  const inventory = [
    INV('PVC pipe 25mm','PVC-25','Pipes & fittings','m',24,12,320,480,'Shelf A1',[{at:D(-12),delta:12,reason:'Received (Harambee Traders)'}]),
    INV('CPVC pipe 25mm','CPVC-25','Pipes & fittings','m',14,10,380,520,'Shelf A2'),
    INV('PPR pipe 20mm','PPR-20','Pipes & fittings','m',40,20,280,420,'Shelf A3'),
    INV('Push-fit coupling 25mm','PFC-25','Pipes & fittings','pcs',18,10,140,220,'Shelf A4'),
    INV('Faucet washer kit','FWK','Fixtures','kit',9,5,600,950,'Shelf B1'),
    INV('Tap cartridge (universal)','TCU','Fixtures','pcs',6,4,850,1400,'Shelf B1'),
    INV('Mixer tap (basin)','MTB','Fixtures','pcs',3,2,5200,8500,'Shelf B2'),
    INV('Toilet flapper kit','TFT','Fixtures','kit',4,4,900,1450,'Shelf B2'),
    INV('Wax ring & bolts','WRB','Fixtures','kit',7,4,450,800,'Shelf B3'),
    INV('Geyser element 2kW','GE2','Geysers & heating','pcs',2,2,2400,3800,'Shelf C1'),
    INV('Anode rod','AROD','Geysers & heating','pcs',3,2,1400,2200,'Shelf C1'),
    INV('Geyser 50L','G50','Geysers & heating','pcs',2,1,16800,24500,'Yard'),
    INV('Submersible pump 1HP','SP1','Pumps & motors','pcs',1,1,12500,18500,'Yard'),
    INV('Check & foot valve','CFV','Pumps & motors','kit',4,2,1600,2800,'Shelf C2'),
    INV('Drain auger 6m','DAG6','Tools','pcs',1,1,7500,11000,'Tool room'),
    INV('Silicone sealant tube','SIL','Consumables','pcs',11,6,380,650,'Shelf B4'),
    INV('Drain enzyme gel 500ml','ENZ','Consumables','pcs',0,3,550,900,'Shelf B4',[{at:D(-2),delta:-3,reason:'Used on PARK-13'}]),
    INV('P-trap 1.2"','PTR','Pipes & fittings','pcs',5,4,700,1200,'Shelf A4'),
    INV('Angle valve 3/8','AV38','Pipes & fittings','pcs',8,5,650,1100,'Shelf A4'),
    INV('WC pan & cistern','WCP','Fixtures','pcs',2,1,9800,14500,'Yard'),
    INV('Shower column (thermo)','SCT','Fixtures','pcs',1,1,6500,9800,'Yard'),
    INV('Bathroom fittings pack','BFP','Pipes & fittings','kit',2,1,2600,4500,'Shelf A5'),
    INV('Solar water heater 300L (kit)','SWH-300','Solar','kit',1,1,42000,65000,'Yard'),
    INV('EV200 controller','EV200','Solar','pcs',2,1,4800,7500,'Shelf D1'),
    INV('Mounting & piping kit (300L)','SWH-MK','Solar','kit',1,1,6500,9800,'Yard'),
    INV('Solar PV 250W panel','PV250','Solar','pcs',10,4,8500,13500,'Yard'),
    INV('3kW hybrid inverter','INV3K','Solar','pcs',1,1,24500,38000,'Shelf D2'),
    INV('100Ah tubular battery','BAT100','Solar','pcs',6,4,11500,16800,'Yard'),
    INV('Charge controller 60A','CC60','Solar','pcs',3,2,6200,9800,'Shelf D2'),
    INV('Solar cabling & DB pack','SCDB','Solar','kit',2,1,12500,18000,'Shelf D2')
  ];

  const maint = (cust,equipment,freq,lastOff,notes='') => ({id:uid('m'),customerId:cust.id,equipment,frequencyMonths:freq,lastDone:D(lastOff),notes});
  const maintenance = [
    maint(CLINIC,'Boiler (200L)',3,-100,'Pressure & safety check each quarter'),
    maint(PARK,'Grease trap & drains',3,-95),
    maint(KAREN,'Rooftop water pump',6,-200,'Check pressure switch & cabling'),
    maint(NJERI,'Geyser 50L',12,-340),
    maint(SUNRISE,'Backflow preventer',12,-300,'NAWSCA certification renewal'),
    maint(MUTUA,'Solar water heater',12,-1,'Annual flush, tube & controller inspection')
  ];

  const outbox = [
    {id:uid('o'), to:NJERI.phone, contact:NJERI.name, purpose:'Dispatch',
     text: fillTemplate(DEFAULT_TEMPLATES.dispatch,{customer:'Grace',tech:'Brian Otieno',address:'7 Runda Ave, Runda',job:'Geyser 50L replacement install',time:'11:00',business:'AquaFlow Plumbing Ltd'}),
     createdAt:new Date(Date.now()-3600e3).toISOString(), sent:false},
    {id:uid('o'), to:KAMAU.phone, contact:KAMAU.name, purpose:'Quote sent',
     text: fillTemplate(DEFAULT_TEMPLATES.quote_sent,{customer:'Wanjiku',ref:`QUO-${Y}-0001`,total:money(Math.round(sum(quotes[2].items,i=>i.qty*i.price)*1.16)),title:'Bathroom refit',valid:fmtDate(D(10)),business:'AquaFlow Plumbing Ltd'}),
     createdAt:new Date(Date.now()-86400e3).toISOString(), sent:false},
    {id:uid('o'), to:PARK.phone, contact:PARK.name, purpose:'Payment received',
     text: fillTemplate(DEFAULT_TEMPLATES.payment_received,{customer:'The Park Hotel',amount:money(inv7),ref:`INV-${Y}-0007`,business:'AquaFlow Plumbing Ltd'}),
     createdAt:new Date(Date.now()-3*86400e3).toISOString(), sent:true}
  ];

  return {
    v:1,
    counters:{job:15, quote:6, invoice:9},
    business:{
      name:'AquaFlow Plumbing Ltd', phone:'+254 712 345 678', whatsapp:'254712345678',
      email:'hello@aquaflow.co.ke', address:'12 Riverside Avenue, Westlands, Nairobi',
      vatRate:16, dueDays:14, currency:'KES',
      rates:{standard:1200, senior:1800, apprentice:900},
      travel:{city:400, outskirts:1200, county:2500},
      prefixes:{job:'JOB', quote:'QUO', invoice:'INV'},
      templates:{...DEFAULT_TEMPLATES}
    },
    customers, technicians, jobs, quotes, invoices, inventory, maintenance, outbox
  };
}
