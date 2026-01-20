#!/bin/bash

# Ejemplo de cómo hacer el curl correctamente
# Guarda este JSON en un archivo primero para evitar problemas con comillas

curl --location --request POST 'http://localhost:3003/save-json' \
--header 'Content-Type: application/json' \
--data @- << 'EOF'
{
    "ambiente": "DEV",
    "token": "1D1F1976B893E31D0519062F7AA490E6A96BFCCBEA86386AEE6457B9938EBCF50A657C16CF1DE48CFC4360413EC249E8A046D27531524000B3B7BD6B2F94CEBB",
    "filename": "GENER_NEXUS-DEMOGRAFICO-CARLOS",
    "jsonData": {
        "GENER_NEXUS-DEMOGRAFICO-CARLOS": {
            "Type": "SimpleFolder",
            "ControlmServer": "COOPEUCH",
            "OrderMethod": "Manual",
            "CC1040P2": {
                "Type": "Job:OS400:Full:CommandLine",
                "CommandLine": "CALL PGM(RBIENVFCL)  PARM('CTINTDEM' 'NEXDEM')",
                "SubApplication": "GENER_NEXUS-DEMOGRAFICO-CARLOS",
                "Priority": "Very Low",
                "FileName": "CC1040P2",
                "Confirm": true,
                "Host": "ibsqa",
                "FilePath": "CC1040P2",
                "CreatedBy": "emuser",
                "Description": "NEXUS-DEMOGRAFICO",
                "RunAs": "Q7ABATCH",
                "Application": "GENER_NEXUS-DEMOGRAFICO-CARLOS",
                "Variables": [
                    {
                        "tm": "%%TIME"
                    },
                    {
                        "HHt": "%%SUBSTR %%tm  1 2"
                    },
                    {
                        "MMt": "%%SUBSTR %%tm  3 2"
                    },
                    {
                        "SSt": "%%SUBSTR %%tm  5 2"
                    },
                    {
                        "HORA": "%%HHt:%%MMt:%%SSt"
                    },
                    {
                        "OS400-AEV_LEN": "4000"
                    },
                    {
                        "OS400-JOB_NAME": "CC1040P2"
                    },
                    {
                        "OS400-MEM_NAME": "CC1040P2"
                    },
                    {
                        "OS400-MEM_LIB": "CC1040P2"
                    },
                    {
                        "OS400-JOBD": "*USRPRF"
                    },
                    {
                        "OS400-CURLIB": "Q7AHIFILES"
                    },
                    {
                        "OS400-JOB_OWNER": "Q7ABATCH"
                    }
                ],
                "RerunLimit": {
                    "Units": "Minutes",
                    "Every": "0"
                },
                "When": {
                    "WeekDays": [
                        "MON",
                        "TUE",
                        "WED",
                        "THU",
                        "FRI"
                    ],
                    "MonthDays": [
                        "NONE"
                    ],
                    "FromTime": "2000",
                    "DaysRelation": "OR",
                    "ConfirmationCalendars": {
                        "Calendar": "Cal_Habil"
                    }
                },
                "JobAFT": {
                    "Type": "Resource:Pool",
                    "Quantity": "1"
                },
                "IfBase:Folder:Output_12": {
                    "Type": "If:Output",
                    "Code": "código de finalización 20",
                    "Action:SetToNotOK_0": {
                        "Type": "Action:SetToNotOK"
                    },
                    "Mail_1": {
                        "Type": "Action:Mail",
                        "Subject": "%%APPLIC (%%APPLGROUP - %%JOBNAME) ERROR_PROCESO",
                        "To": "controlmerror@coopeuch.cl",
                        "Message": "Estimado, informo a Ud. que el job %%JOBNAME y proceso  detallado en el asunto de este mail, finalizµ incorrectamente. AdemÃs, se registra el promedio del tiempo de ejecuciµn(en segundos)  y hora de termino del proceso: %%AVG_TIME  - %%DAY/%%MONTH/%%$YEAR %%HORA\\n\\nAtte.\\n\\nOperador de Sistema.",
                        "AttachOutput": false
                    }
                },
                "IfBase:Folder:Output_13": {
                    "Type": "If:Output",
                    "Code": "(error,ERROR,Permission denied,File Not Found)",
                    "Action:SetToNotOK_0": {
                        "Type": "Action:SetToNotOK"
                    },
                    "Mail_1": {
                        "Type": "Action:Mail",
                        "Subject": "%%APPLIC (%%APPLGROUP - %%JOBNAME) ERROR_PROCESO",
                        "To": "controlmerror@coopeuch.cl",
                        "Message": "Estimado, informo a Ud. que el job %%JOBNAME y proceso  detallado en el asunto de este mail, finalizµ incorrectamente. AdemÃs, se registra el promedio del tiempo de ejecuciµn(en segundos)  y hora de termino del proceso: %%AVG_TIME  - %%DAY/%%MONTH/%%$YEAR %%HORA\\n\\nAtte.\\n\\nOperador de Sistema.\\n",
                        "AttachOutput": false
                    }
                },
                "IfBase:Folder:Output_14": {
                    "Type": "If:Output",
                    "Code": "Mensaje . . . . :   C",
                    "Action:SetToNotOK_0": {
                        "Type": "Action:SetToNotOK"
                    },
                    "Mail_1": {
                        "Type": "Action:Mail",
                        "Subject": "%%APPLIC (%%APPLGROUP - %%JOBNAME) ERROR_PROCESO",
                        "To": "controlmerror@coopeuch.cl",
                        "Message": "Estimado, informo a Ud. que el job %%JOBNAME y proceso  detallado en el asunto de este mail, finalizµ incorrectamente. AdemÃs, se registra el promedio del tiempo de ejecuciµn(en segundos)  y hora de termino del proceso: %%AVG_TIME  - %%DAY/%%MONTH/%%$YEAR %%HORA\\n\\nAtte.\\n\\nOperador de Sistema.\\n",
                        "AttachOutput": false
                    }
                },
                "IfBase:Folder:Output_15": {
                    "Type": "If:Output",
                    "Code": "código de finalización 0",
                    "Action:SetToOK_0": {
                        "Type": "Action:SetToOK"
                    },
                    "Mail_1": {
                        "Type": "Action:Mail",
                        "Subject": "%%APPLIC (%%APPLGROUP - %%JOBNAME) OK_PROCESO",
                        "To": "controlmok@coopeuch.cl",
                        "Message": "Estimado, informo a Ud. que el job  %%JOBNAME y proceso detallado en el asunto de este mail, finalizµ sin problemas. AdemÃs, se registra el promedio del tiempo de ejecuciµn (en segundos) y hora de termino del proceso: %%AVG_TIME  - %%DAY/%%MONTH/%%$YEAR %%HORA\\nAtte.\\n\\nOperador de Sistema.",
                        "AttachOutput": false
                    }
                },
                "IfBase:Folder:Output_16": {
                    "Type": "If:Output",
                    "Code": "Codigo Retorno",
                    "Action:SetToNotOK_0": {
                        "Type": "Action:SetToNotOK"
                    },
                    "Mail_1": {
                        "Type": "Action:Mail",
                        "Subject": "%%APPLIC (%%APPLGROUP - %%JOBNAME) ERROR_PROCESO",
                        "To": "controlmerror@coopeuch.cl",
                        "Message": "Estimado, informo a Ud. que el job %%JOBNAME y proceso  detallado en el asunto de este mail, finalizµ incorrectamente. AdemÃs, se registra el promedio del tiempo de ejecuciµn(en segundos)  y hora de termino del proceso: %%AVG_TIME  - %%DAY/%%MONTH/%%$YEAR %%HORA\\n\\nAtte.\\n\\nOperador de Sistema.\\n",
                        "AttachOutput": false
                    }
                },
                "eventsToWaitFor": {
                    "Type": "WaitForEvents",
                    "Events": [
                        {
                            "Event": "PRECIERRE-EODAY-NEXUS-001-IBS-DIA"
                        }
                    ]
                }
            }
        }
    }
}
EOF
