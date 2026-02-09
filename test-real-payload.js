/**
 * Test con payload real del usuario (versión acortada).
 */
const { convertJsonDataFromJavaMap } = require('./server.js');

// Payload real del usuario - versión acortada (Variables cortas, Message corto, un solo IfBase)
const PAYLOAD_REAL = '{GENER_NEXUS-DEMOGRAFICO-CARLOS={Type=SimpleFolder, ControlmServer=COOPEUCH, OrderMethod=Manual, CC1040P2={Type=Job:OS400:Full:CommandLine, CommandLine=CALL PGM(RBIENVFCL) PARM(\'CTINTDEM\' \'NEXDEM\'), SubApplication=GENER_NEXUS-DEMOGRAFICO-CARLOS, Priority=Very Low, FileName=CC1040P2, Confirm=true, Host=ibsqa, FilePath=CC1040P2, CreatedBy=emuser, Description=NEXUS-DEMOGRAFICO, RunAs=Q7ABATCH, Application=GENER_NEXUS-DEMOGRAFICO-CARLOS, Variables=[{tm=%%TIME}, {HHt=%%SUBSTR %%tm 1 2}, {OS400-JOB_OWNER=Q7ABATCH}], RerunLimit={Units=Minutes, Every=0}, When={WeekDays=[MON, TUE, WED, THU, FRI], MonthDays=[NONE], FromTime=2000, DaysRelation=OR, ConfirmationCalendars={Calendar=Cal_Habil}}, JobAFT={Type=Resource:Pool, Quantity=1}, IfBase:Folder:Output_12={Type=If:Output, Code=x, Mail_1={Type=Action:Mail, Message=Estimado, informo a Ud., AttachOutput=false}}, eventsToWaitFor={Type=WaitForEvents, Events=[{Event=PRECIERRE-EODAY-NEXUS-001-IBS-DIA}]}}}}';

const r = convertJsonDataFromJavaMap(PAYLOAD_REAL);
if (!r.converted) {
    console.error('Error:', r.error);
    process.exit(1);
}
const job = r.converted['GENER_NEXUS-DEMOGRAFICO-CARLOS'] && r.converted['GENER_NEXUS-DEMOGRAFICO-CARLOS'].CC1040P2;
if (!job) {
    console.error('No se encontró CC1040P2');
    process.exit(1);
}
console.log('Claves en CC1040P2:', Object.keys(job).join(', '));
console.log('When:', !!job.When);
console.log('JobAFT:', !!job.JobAFT);
console.log('IfBase:Folder:Output_12:', !!job['IfBase:Folder:Output_12']);
console.log('eventsToWaitFor:', !!job.eventsToWaitFor);

// WeekDays debe ser ["MON","TUE","WED","THU","FRI"]; el último elemento no debe contener "], MonthDays="
const weekDays = job.When && job.When.WeekDays;
const expectedWeekDays = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
if (!Array.isArray(weekDays) || weekDays.length !== 5) {
    console.error('WeekDays debe ser array de 5 elementos:', weekDays);
    process.exit(1);
}
const lastDay = weekDays[4];
if (lastDay !== 'FRI' || lastDay.includes('],') || lastDay.includes('MonthDays')) {
    console.error('Último elemento de WeekDays debe ser exactamente "FRI", recibido:', JSON.stringify(lastDay));
    process.exit(1);
}
const weekDaysOk = expectedWeekDays.every((d, idx) => weekDays[idx] === d);
if (!weekDaysOk) {
    console.error('WeekDays esperado:', expectedWeekDays, 'recibido:', weekDays);
    process.exit(1);
}
console.log('WeekDays OK:', weekDays);

if (job.When && job.JobAFT && job['IfBase:Folder:Output_12'] && job.eventsToWaitFor) {
    console.log('\nOK: Todos los campos esperados están presentes.');
} else {
    console.log('\nFALTA: Algunos campos no se parsearon.');
    process.exit(1);
}
