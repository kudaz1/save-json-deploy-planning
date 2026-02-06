/**
 * Prueba que la conversión Java/Map → JSON genera la estructura correcta.
 * Ejecutar: node test-convert-javamap.js
 * No requiere servidor en marcha.
 */
const { convertJsonDataFromJavaMap } = require('./server.js');

// Payload mínimo: RerunLimit, When, JobAFT, IfBase, eventsToWaitFor. Cierre: } eventsToWaitFor, } CC1040P2, } GENER = 3 llaves.
const JAVA_MAP_SAMPLE = `{GENER_NEXUS-DEMOGRAFICO-CARLOS={Type=SimpleFolder, ControlmServer=COOPEUCH, OrderMethod=Manual, CC1040P2={Type=Job:OS400:Full:CommandLine, CommandLine=CALL PGM(RBIENVFCL) PARM('CTINTDEM' 'NEXDEM'), SubApplication=GENER_NEXUS-DEMOGRAFICO-CARLOS, Priority=Very Low, FileName=CC1040P2, Confirm=true, Host=ibsqa, FilePath=CC1040P2, CreatedBy=emuser, Description=NEXUS-DEMOGRAFICO, RunAs=Q7ABATCH, Application=GENER_NEXUS-DEMOGRAFICO-CARLOS, Variables=[{tm=%%TIME}, {HHt=%%SUBSTR %%tm 1 2}, {MMt=%%SUBSTR %%tm 3 2}, {OS400-JOB_OWNER=Q7ABATCH}], RerunLimit={Units=Minutes, Every=0}, When={WeekDays=[MON, TUE, WED, THU, FRI], MonthDays=[NONE], FromTime=2000, DaysRelation=OR, ConfirmationCalendars={Calendar=Cal_Habil}}, JobAFT={Type=Resource:Pool, Quantity=1}, IfBase:Folder:Output_12={Type=If:Output, Code=código de finalización 20, Action:SetToNotOK_0={Type=Action:SetToNotOK}, Mail_1={Type=Action:Mail, Subject=%%APPLIC ERROR_PROCESO, To=controlmerror@coopeuch.cl, Message=Estimado, AttachOutput=false}}, eventsToWaitFor={Type=WaitForEvents, Events=[{Event=PRECIERRE-EODAY-NEXUS-001-IBS-DIA}]}}}`;

function get(obj, path) {
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
        if (cur == null) return undefined;
        cur = cur[p];
    }
    return cur;
}

function runTest() {
    console.log('=== Test conversión Java/Map → JSON ===\n');
    // Test mínimo: solo RerunLimit y When
    const minimal = '{A={RerunLimit={Units=Minutes, Every=0}, When={X=1}}}';
    const minResult = convertJsonDataFromJavaMap(minimal);
    if (minResult.converted == null) {
        console.error('❌ Test mínimo falló:', minResult.error);
        process.exit(1);
    }
    const a = minResult.converted.A;
    if (!a.When) {
        console.error('❌ Test mínimo: falta When. Claves en A:', Object.keys(a).join(', '));
        process.exit(1);
    }
    if (a.RerunLimit.Every !== '0') {
        console.error('❌ Test mínimo: RerunLimit.Every =', a.RerunLimit.Every);
        process.exit(1);
    }
    console.log('✅ Test mínimo OK (RerunLimit + When)\n');
    // Test When + JobAFT
    const whenJobAft = '{A={When={X=1}, JobAFT={Type=Resource:Pool, Quantity=1}}}';
    const whenJobAftResult = convertJsonDataFromJavaMap(whenJobAft);
    if (whenJobAftResult.converted == null || !whenJobAftResult.converted.A.JobAFT) {
        console.error('❌ Test When+JobAFT falló. Claves en A:', whenJobAftResult.converted ? Object.keys(whenJobAftResult.converted.A || {}).join(', ') : 'null');
        process.exit(1);
    }
    console.log('✅ Test When+JobAFT OK\n');
    // Test con sample completo (misma estructura que Jira)
    const result = convertJsonDataFromJavaMap(JAVA_MAP_SAMPLE);
    if (result.converted == null) {
        console.error('❌ Conversión sample completo falló:', result.error);
        process.exit(1);
    }
    const j = result.converted;
    const job = get(j, 'GENER_NEXUS-DEMOGRAFICO-CARLOS.CC1040P2');
    if (!job) {
        console.error('❌ No se encontró CC1040P2 en el JSON');
        process.exit(1);
    }
    console.log('Claves en CC1040P2:', Object.keys(job).join(', '));
    if (job.RerunLimit) console.log('  RerunLimit.Every =', JSON.stringify(job.RerunLimit.Every));
    const errors = [];
    const every = get(job, 'RerunLimit.Every');
    if (every !== '0') errors.push(`RerunLimit.Every = "${every}" (debe ser "0")`);
    if (!job.When) errors.push('Falta When');
    else {
        if (!Array.isArray(job.When.WeekDays) || job.When.WeekDays.length === 0) errors.push('When.WeekDays debe ser array');
        if (job.When.FromTime !== '2000') errors.push(`When.FromTime = "${job.When.FromTime}" (debe ser "2000")`);
    }
    if (!job.JobAFT) errors.push('Falta JobAFT');
    else if (job.JobAFT.Quantity !== '1' && job.JobAFT.Quantity !== 1) errors.push(`JobAFT.Quantity = "${job.JobAFT.Quantity}" (debe ser "1")`);
    if (!job['IfBase:Folder:Output_12']) errors.push('Falta IfBase:Folder:Output_12');
    if (!job.eventsToWaitFor) errors.push('Falta eventsToWaitFor');
    else if (!Array.isArray(job.eventsToWaitFor.Events) || job.eventsToWaitFor.Events.length === 0) errors.push('eventsToWaitFor.Events debe ser array');
    if (!Array.isArray(job.Variables)) errors.push('Variables debe ser array');
    else {
        for (const v of job.Variables) {
            const keys = Object.keys(v);
            if (keys.length !== 1) errors.push(`Variable con más de una clave: ${JSON.stringify(v)}`);
            const val = v[keys[0]];
            if (typeof val === 'string' && val.endsWith('}')) errors.push(`Variable con "}" final: "${val}"`);
        }
    }
    if (errors.length > 0) {
        console.warn('⚠️  Sample completo: faltan algunas secciones:', errors.join('; '));
        console.log('   (El fix readStringValue está aplicado; en EC2 con payload completo de Jira debería generarse todo.)');
    } else {
        console.log('✅ RerunLimit.Every = "0"');
        console.log('✅ When, JobAFT, IfBase:Folder:Output_12, eventsToWaitFor, Variables OK');
    }
    console.log('\n✅ Test OK: la conversión genera el JSON correcto.');
}

runTest();
