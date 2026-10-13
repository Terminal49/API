# Terminal identifier verification

Checked 2026-10-13. 138 terminal identities, 131 SMDG matches, 49 retained US FIRMS, 7 unresolved SMDG.

Primary source: [Official SMDG TCL v20260609](https://smdg.org/wp-content/uploads/Codelists/Terminals/SMDG-Terminal-Code-List-v20260609.xlsx), TERMINALS sheet. Published from https://smdg.org/documents/smdg-code-lists/smdg-terminal-code-list/ . Workbook SHA-256 `26d893e922d6c10d6cb5b2571ebb4960c723b7aba9e4cbcab45619960ac1bd1a`. Each row reference below points to this exact public workbook. Matches use terminal facility/company and port, not generic identifier suffix alone. No expired row assigned.

SMDG Description sheet: maritime container terminal facilities; excludes inland depots. Terminal code is alphanumeric 3–6 characters and only unique together with port UN/LOCODE. FIRMS values are retained from existing public Terminal49 registry https://github.com/Terminal49/API/blob/96965f9/docs/data/coverage/coverage.json ; no claim of fresh CBP verification. Non-US numeric customs identifiers remain legacy terminalCode only.

Unresolved: Chittagong broad port (expired), Gloucester, Shippers Long Beach/Carson/Oakland, Tioga, Portsmouth(port code mismatch). STA/STO remain blank FIRMS; Z773 retained for Carson.

## Identity evidence

| Source identity key | Existing terminal | SMDG | FIRMS | Evidence / caveat |
|---|---|---|---|---|
| `ARBUE:ARBUETERM4` | APM Terminals Buenos Aires T4 | TERM4 | — | TERMINALS row 29: ARBUE / TERM4 / APM TERMINALS BUENOS AIRES T4; active (Valid to blank). |
| `AUADL:AUADLFLACT` | Flinders Adelaide Container Terminal | FLACT | — | TERMINALS row 43: AUADL / FLACT / FLINDERS ADELAIDE CONTAINER TERMINAL; active (Valid to blank). |
| `AUBNE:AUBNEPTFIT` | Brisbane Autostrad | PTFIT | — | TERMINALS row 48: AUBNE / PTFIT / PATRICK BRISBANE AUTOSTRAD TERMINAL; active (Valid to blank). |
| `AUBNE:DP World Brisbane` | DP World Brisbane | DPBNE | — | TERMINALS row 46: AUBNE / DPBNE / DP WORLD BRISBANE FISHERMAN ISLANDS; active (Valid to blank). |
| `AUBNE:AUBNEHPAFI` | Hutchison Brisbane Container Terminals | HPAFI | — | TERMINALS row 47: AUBNE / HPAFI / HUTCHISON BRISBANE CONTAINER TERMINALS (BCT); active (Valid to blank). |
| `AUFRE:DP World Fremantle` | DP World Fremantle | CONFR | — | TERMINALS row 51: AUFRE / CONFR / DP WORLD FREMANTLE; active (Valid to blank). |
| `AUFRE:AUFREASLFR` | Fremantle | ASLFR | — | TERMINALS row 52: AUFRE / ASLFR / PATRICK FREMANTLE CONTAINER TERMINAL; active (Valid to blank). |
| `AUMEL:DP World West Swanson Dock` | DP World West Swanson Dock | CONWS | — | TERMINALS row 55: AUMEL / CONWS / DP WORLD WEST SWANSON DOCK TERMINAL; active (Valid to blank). |
| `AUMEL:AUMELASES1` | East Swanson Dock | ASES1 | — | TERMINALS row 56: AUMEL / ASES1 / PATRICK EAST SWANSON DOCK TERMINAL; active (Valid to blank). |
| `AUMEL:AUMELVICTM` | VICT Webb Dock East | VICTM | — | TERMINALS row 58: AUMEL / VICTM / VICT WEBB DOCK EAST; active (Valid to blank). |
| `AUSYD:DP World Sydney` | DP World Sydney | CTLPB | — | TERMINALS row 60: AUSYD / CTLPB / DP WORLD SYDNEY; active (Valid to blank). |
| `AUSYD:AUSYDHPAPB` | Hutchison Sydney International Container Terminal | HPAPB | — | TERMINALS row 61: AUSYD / HPAPB / HUTCHISON SYDNEY INTERNATIONAL CONTAINER TERMINAL (SICTL); active (Valid to blank). |
| `AUSYD:AUSYDASLPB` | Sydney Autostrad | ASLPB | — | TERMINALS row 62: AUSYD / ASLPB / PATRICK SYDNEY AUTOSTRAD TERMINAL; active (Valid to blank). |
| `BDCGP:BDCGPCPA` | Chittagong Port | — | — | Broad port-level record; former Chittagong Port SMDG BDPORT (row67) expired 2025-09-30. Current CCT/GCB/NCT/PCT are separate terminals and cannot safely be substituted. |
| `BRPEC:BRPECBRAPEC` | APM Terminals Pecem | BRAPEC | — | TERMINALS row 101: BRPEC / BRAPEC / APM TERMINALS PECEM; active (Valid to blank). |
| `CAHAL:2036` | South End Container Terminal | HAFXT | — | TERMINALS row 123: CAHAL / HAFXT / SOUTH END CONTAINER TERMINAL; active (Valid to blank). |
| `CAMTR:2619` | Maisonneuve - Section 68 | TMTMAI | — | TERMINALS row 125: CAMTR / TMTMAI / MAISONNEUVE TERMINAL (SECTION 68); active (Valid to blank). |
| `CAMTR:2425` | MGTP Cast - Section 77 | MGTCAS | — | TERMINALS row 124: CAMTR / MGTCAS / CAST TERMINAL (SECTION 77); active (Valid to blank). |
| `CAMTR:2591` | MGTP Racine - Section 66 | MGTRAC | — | TERMINALS row 126: CAMTR / MGTRAC / RACINE TERMINAL (SECTION 62); active (Valid to blank). Existing display says Section 66, while official SMDG and terminal operator identify Racine as Section 62. Matched unique Racine facility+Montreal; CMA CGM CBSA list confirms sublocation 2591. https://www.mtrtml.com/contactez-nous/ ; https://www.cma-cgm.com/assets/public/documents/Sub-Location%2520Codes%2520V.8_0.pdf |
| `CAMTR:5540` | Viau - Section 52 | VIAU | — | TERMINALS row 127: CAMTR / VIAU / VIAU TERMINAL (SECTION 52); active (Valid to blank). |
| `CAPRR:5086` | Prince Rupert Container Terminal | FCTPRR | — | TERMINALS row 128: CAPRR / FCTPRR / FAIRVIEW CONTAINER TERMINAL; active (Valid to blank). SMDG current name is Fairview Container Terminal; official DP World / Prince Rupert port facility. Registry site https://www.rupertport.com/terminal_details/fairview-container-terminal/ and MSC sublocation 5086 identify same facility. |
| `CAVAN:3380` | DP World Centerm | CTM | — | TERMINALS row 130: CAVAN / CTM / CENTENNIAL TERMINAL (CENTERM); active (Valid to blank). |
| `CAVAN:3891` | GCT Deltaport | DLT | — | TERMINALS row 132: CAVAN / DLT / GCT DELTAPORT; active (Valid to blank). Alternative UN/LOCODE CADEL. |
| `CAVAN:3395` | GCT Vanterm | VTM | — | TERMINALS row 133: CAVAN / VTM / GCT VANTERM; active (Valid to blank). |
| `CLSAI:CLSAISTI` | STI San Antonio | STI | — | TERMINALS row 151: CLSAI / STI / STI SAN ANTONIO; active (Valid to blank). |
| `DOHAI:DOHAIHIT` | Haina International Terminals | HIT | — | TERMINALS row 297: DOHAI / HIT / HAINA INTERNATIONAL TERMINALS; active (Valid to blank). |
| `ECGYE:ECGYECONTE` | Contecon Guayaquil | CONTE | — | TERMINALS row 306: ECGYE / CONTE / CONTECON GUAYAQUIL; active (Valid to blank). |
| `EGPSD:EGPSDSCCT` | Suez Canal Container Terminal | SCCT | — | TERMINALS row 322: EGPSD / SCCT / SUEZ CANAL CONTAINER TERMINAL (SCCT); active (Valid to blank). Alternative UN/LOCODE EGPSE. |
| `DEBRV:DEBRVEGB` | EUROGATE Container Terminal Bremerhaven | EGB | — | TERMINALS row 272: DEBRV / EGB / EUROGATE CONTAINER TERMINAL BREMERHAVEN; active (Valid to blank). |
| `DEBRV:DEBRVMSCBH` | MSC Gate Bremerhaven | MSCBH | — | TERMINALS row 273: DEBRV / MSCBH / MSC GATE BREMERHAVEN; active (Valid to blank). |
| `DEHAM:DEHAMEGH` | EUROGATE Hamburg | EGH | — | TERMINALS row 276: DEHAM / EGH / EUROGATE CONTAINER TERMINAL HAMBURG; active (Valid to blank). |
| `DEHAM:DEHAMCTA` | HHLA Container Terminal Altenwerder | CTA | — | TERMINALS row 277: DEHAM / CTA / HHLA CONTAINER TERMINAL ALTENWERDER (CTA); active (Valid to blank). |
| `DEHAM:DEHAMCTB` | HHLA Container Terminal Burchardkai | CTB | — | TERMINALS row 278: DEHAM / CTB / HHLA CONTAINER TERMINAL BURCHARDKAI (CTB); active (Valid to blank). |
| `DEHAM:DEHAMCTT` | HHLA Container Terminal Tollerort | CTT | — | TERMINALS row 279: DEHAM / CTT / HHLA CONTAINER TERMINAL TOLLERORT (CTT); active (Valid to blank). |
| `DEWVN:DEWVNEGW` | EUROGATE Container Terminal Wilhelmshaven | EGW | — | TERMINALS row 285: DEWVN / EGW / EUROGATE CONTAINER TERMINAL WILHELMSHAVEN; active (Valid to blank). |
| `GTPRQ:GTPRQTCQ` | APM Terminals Quetzal | TCQ | — | TERMINALS row 439: GTPRQ / TCQ / APM TERMINALS QUETZAL; active (Valid to blank). |
| `GTSTC:GTSTCEPSTC` | Empresa Portuaria Santo Tomas | EPSTC | — | TERMINALS row 441: GTSTC / EPSTC / EMPRESA PORTUARIA NACIONAL TERMINAL; active (Valid to blank). |
| `HKHKG:HKHKGACTHK` | Asia Container Terminals | ACTHK | — | TERMINALS row 446: HKHKG / ACTHK / ASIA CONTAINER TERMINALS (ACT); active (Valid to blank). |
| `HKHKG:HKHKGCHTHK` | COSCO-HIT | CHTHK | — | TERMINALS row 448: HKHKG / CHTHK / COSCO-HIT (CHT); active (Valid to blank). |
| `HKHKG:HKHKGHITHK` | Hong Kong International Terminals | HITHK | — | TERMINALS row 450: HKHKG / HITHK / HONG KONG INTERNATIONAL TERMINALS (HIT); active (Valid to blank). |
| `HKHKG:HKHKGMTLHK` | Hong Kong Modern Terminals | MTLHK | — | TERMINALS row 451: HKHKG / MTLHK / HONG KONG MODERN TERMINALS (MTL); active (Valid to blank). |
| `IDJKT:IDJKTUTC1` | Jakarta International Container Terminal | UTC1 | — | TERMINALS row 472: IDJKT / UTC1 / JAKARTA INTERNATIONAL CONTAINER TERMINAL (UTC1); active (Valid to blank). |
| `IQUQR:IQUQRBGTE` | Basra Gateway Terminal East | BGTE | — | TERMINALS row 542: IQUQR / BGTE / BASRA GATEWAY TERMINAL EAST; active (Valid to blank). |
| `IQUQR:IQUQRBGTW` | Basra Gateway Terminal West | BGTW | — | TERMINALS row 543: IQUQR / BGTW / BASRA GATEWAY TERMINAL WEST; active (Valid to blank). |
| `IEDUB:IEDUBDFP` | Dublin Ferryport Terminal | DFP | — | TERMINALS row 498: IEDUB / DFP / DUBLIN FERRYPORT TERMINAL; active (Valid to blank). |
| `ILHFA:ILHFAHPCL` | Haifa Port | HPCL | — | TERMINALS row 509: ILHFA / HPCL / HAIFA PORT CO., LTD.; active (Valid to blank). |
| `ITLIV:ITLIVTAFLIV` | Terminal Alto Fondale | TAFLIV | — | TERMINALS row 564: ITLIV / TAFLIV / TERMINAL ALTO FONDALE; active (Valid to blank). |
| `ITLIV:ITLIVTDT` | Terminal Darsena Toscana | TDT | — | TERMINALS row 565: ITLIV / TDT / TERMINAL DARSENA TOSCANA (TDT); active (Valid to blank). |
| `ITLIV:ITLIVIMP` | Terminal Dock Etruschi | IMP | — | TERMINALS row 566: ITLIV / IMP / TERMINAL DOCK ETRUSCHI; active (Valid to blank). |
| `ITLIV:ITLIVLOREN` | Terminal Lorenzini | LOREN | — | TERMINALS row 567: ITLIV / LOREN / TERMINAL LORENZINI; active (Valid to blank). |
| `ITNAP:ITNAPCONA` | Conateco Terminal | CONA | — | TERMINALS row 569: ITNAP / CONA / TERMINAL CONATECO; active (Valid to blank). |
| `JMKIN:JMKINKCT` | Kingston Container Terminal | KCT | — | TERMINALS row 587: JMKIN / KCT / KINGSTON CONTAINER TERMINAL; active (Valid to blank). |
| `JOAQJ:JOAQJACT` | Aqaba Container Terminal | ACT | — | TERMINALS row 590: JOAQJ / ACT / AQABA CONTAINER TERMINAL; active (Valid to blank). |
| `LBBEY:LBBEYBCTC` | CMA Beirut Terminal | BCTC | — | TERMINALS row 750: LBBEY / BCTC / CMA TERMINALS BEIRUT; active (Valid to blank). |
| `MXATM:20` | Terminal Portuaria | ATP | — | TERMINALS row 795: MXATM / ATP / ALTAMIRA TERMINAL PORTUARIA; active (Valid to blank). |
| `MXESE:27` | International Terminal | EIT | — | TERMINALS row 797: MXESE / EIT / HUTCHISON ENSENADA INTERNATIONAL TERMINAL (EIT); active (Valid to blank). |
| `MXLZC:257` | APM Terminals | APMT | — | TERMINALS row 799: MXLZC / APMT / APM TERMINALS LAZARO CARDENAS; active (Valid to blank). |
| `MXLZC:200` | Terminal Portuaria de Contenedores | LCT | — | TERMINALS row 801: MXLZC / LCT / HUTCHISON LAZARO CARDENAS TERMINAL (LCT); active (Valid to blank). Official registry company matches L.C. Terminal Portuaria de Contenedores, distinct from LC Multipurpose. Operator identity also https://www.hutchisonports.com.mx/contact . |
| `MXZLO:241` | Contecon | CMSA | — | TERMINALS row 810: MXZLO / CMSA / CONTECON MANZANILLO; active (Valid to blank). |
| `MXZLO:39` | SSA Mexico | SSAMX | — | TERMINALS row 811: MXZLO / SSAMX / SSA MEXICO HOLDINGS; active (Valid to blank). |
| `MXZLO:40` | Terminal Internacional de Manzanillo | TIMSA | — | TERMINALS row 812: MXZLO / TIMSA / TERMINAL INTL DE MANZANILLO (TIMSA); active (Valid to blank). |
| `MXPGO:184` | Terminal de Contenedores de Yucatan | TCY | — | TERMINALS row 803: MXPGO / TCY / ADMINISTR. PORTUARIA INTEGRAL DE PROGRESO; active (Valid to blank). Registry company explicitly Terminal de Contenedores de Yucatan. Operator confirms former TCY, now APM: https://www.apmterminals.com/es/progreso/about/our-terminal . |
| `MXVER:69` | Hutchison ICAVE | ICAVE | — | TERMINALS row 809: MXVER / ICAVE / HUTCHISON ICAVE VERACRUZ; active (Valid to blank). |
| `OMSLL:OMSLLAPMT` | APM Terminals Salalah | APMT | — | TERMINALS row 914: OMSLL / APMT / APM TERMINALS SALALAH; active (Valid to blank). |
| `PKKHI:PKKHISAPT` | South Asia Pakistan Terminal | SAPT | — | TERMINALS row 957: PKKHI / SAPT / SOUTH ASIA PAKISTAN TERMINAL (SAPT); active (Valid to blank). |
| `PECLL:PECLLAPMCLL` | APM Terminals Callao | APMCLL | — | TERMINALS row 923: PECLL / APMCLL / APM TERMINALS CALLAO; active (Valid to blank). |
| `PLGDY:PLGDYBCT` | Baltic Container Terminal Gdynia | PLBCT | — | TERMINALS row 960: PLGDY / PLBCT / BALTIC CONTAINER TERMINAL GDYNIA (BCT); active (Valid to blank). Use PLBCT from official registry, not BCT suffix of legacy identifier. |
| `SADMM:SADMMFCT` | Dammam First Container Terminal | FCT | — | TERMINALS row 1014: SADMM / FCT / DAMMAM FIRST CONTAINER TERMINAL (FCT); active (Valid to blank). |
| `SADMM:SADMMSCT` | Dammam Second Container Terminal | SCT | — | TERMINALS row 1015: SADMM / SCT / DAMMAM SECOND CONTAINER TERMINAL (SCT); active (Valid to blank). |
| `SAJED:SAJEDDPW` | DP World South Container Terminal Jeddah | DPW | — | TERMINALS row 1017: SAJED / DPW / DP WORLD SOUTH CONTAINER TERMINAL JEDDAH (SCT); active (Valid to blank). |
| `SAJED:SAJEDRSGT` | Red Sea Gateway Terminal | RSGT | — | TERMINALS row 1019: SAJED / RSGT / RED SEA GATEWAY TERMINAL (RSGT); active (Valid to blank). |
| `KRPUS:KRPUSBNCT` | Busan New Container Terminal | BNCT | — | TERMINALS row 735: KRPUS / BNCT / BUSAN NEW CONTAINER TERMINAL (BNCT); active (Valid to blank). |
| `ESALG:ESALGAPM` | APM Terminals Algeciras | APM | — | TERMINALS row 330: ESALG / APM / APM TERMINALS ALGECIRAS; active (Valid to blank). |
| `ESBCN:ESBCNBEST` | Hutchison Ports BEST | BEST | — | TERMINALS row 332: ESBCN / BEST / BARCELONA EUROPE SOUTH TERMINAL (BEST); active (Valid to blank). |
| `SEGOT:SEGOTCT1` | APM Terminals Gothenburg | CT1 | — | TERMINALS row 1027: SEGOT / CT1 / APM TERMINALS GOTHENBURG; active (Valid to blank). |
| `TWKHH:TWKHHKMCT` | Kao Ming Terminal | KMCT | — | TERMINALS row 1131: TWKHH / KMCT / KAO MING TERMINAL (W108-W111); active (Valid to blank). |
| `AEJEA:AEJEADPWJ2` | DP World Jebel Ali | DPWJ2 | — | TERMINALS row 10: AEJEA / DPWJ2 / DP WORLD JEBEL ALI - CT2; active (Valid to blank). Legacy DPWJ2 and registry CT2 identify terminal despite generic display name. |
| `AEJEA:AEJEADPWJ3` | DP World Jebel Ali | DPWJ3 | — | TERMINALS row 11: AEJEA / DPWJ3 / DP WORLD JEBEL ALI - CT3; active (Valid to blank). Legacy DPWJ3 and registry CT3 identify terminal despite generic display name. |
| `AEJEA:AEJEADPWJA` | DP World Jebel Ali CT1 | DPWJA | — | TERMINALS row 9: AEJEA / DPWJA / DP WORLD JEBEL ALI - CT1; active (Valid to blank). |
| `AEJEA:AEJEADPWJ4` | DP World Jebel Ali CT4 | DPWJ4 | — | TERMINALS row 12: AEJEA / DPWJ4 / DP WORLD JEBEL ALI - CT4; active (Valid to blank). |
| `GBBEL:GBBELVIC3` | Victoria Terminal 3 | VIC3 | — | TERMINALS row 401: GBBEL / VIC3 / VICTORIA TERMINAL 3 (VT3); active (Valid to blank). |
| `GBFXT:GBFXTLNG` | Berths 8&9 | LNG | — | TERMINALS row 403: GBFXT / LNG / LANDGUARD TERMINAL (BERTHS 8&9); active (Valid to blank). |
| `GBFXT:GBFXTTTY` | Trinity Terminal | TTY | — | TERMINALS row 404: GBFXT / TTY / TRINITY TERMINAL; active (Valid to blank). |
| `GBLGP:GBLGPDPWLG` | DP World London Gateway | DPWLG | — | TERMINALS row 409: GBLGP / DPWLG / LONDON GATEWAY; active (Valid to blank). |
| `GBSOU:GBSOUDPWS` | DP World Southampton | DPWS | — | TERMINALS row 414: GBSOU / DPWS / DP WORLD SOUTHAMPTON; active (Valid to blank). |
| `USBAL:C324` | Seagirt Terminal | SMT | C324 | TERMINALS row 1154: USBAL / SMT / SEAGIRT MARINE TERMINAL; active (Valid to blank). FIRMS C324 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USGLC:D104` | Gloucester Marine Terminal | — | D104 | No Gloucester Marine Terminal match in current SMDG registry, including a search across all ports. Keep existing FIRMS D104. FIRMS D104 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USHOU:S787` | Barbours Cut Terminal | BCMT | S787 | TERMINALS row 1166: USHOU / BCMT / BARBOURS CUT MARINE TERMINAL; active (Valid to blank). FIRMS S787 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USHOU:V136` | Bayport Container Terminal | BPTM | V136 | TERMINALS row 1167: USHOU / BPTM / BAYPORT TERMINAL; active (Valid to blank). FIRMS V136 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USJAX:N296` | Blount Island Terminal | BLOJX | N296 | TERMINALS row 1173: USJAX / BLOJX / SSA JACKSONVILLE CONTAINER TERMINAL (JCT); active (Valid to blank). Current active BLOJX row 1173 is SSA Jacksonville; older BLOJX row 1171 Blount Island expired 2025-03-31. Facility match under same port; retained approved FIRMS N296. FIRMS N296 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USJAX:N762` | Tote Maritime | TMG | N762 | TERMINALS row 1175: USJAX / TMG / TOTE TERMINAL BLOUNT ISLAND; active (Valid to blank). FIRMS N762 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USJAX:M029` | Trapac Jacksonville Terminal | DPJL | M029 | TERMINALS row 1172: USJAX / DPJL / DAMES POINT MARINE TERMINAL; active (Valid to blank). TraPac Jacksonville facility is at Dames Point. Official operator confirms FIRMS M029: https://www.trapac.com/news/jacksonville-contact-information/ ; port facility history: https://www.jaxport.com/corporate/about-jaxport/port-history/ . FIRMS M029 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USLGB:Y309` | International Transportation Service | ITS | Y309 | TERMINALS row 1182: USLGB / ITS / ITS LONG BEACH (PIER G); active (Valid to blank). FIRMS Y309 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USLGB:WAC8` | Long Beach Container Terminal | LBCT | WAC8 | TERMINALS row 1183: USLGB / LBCT / LONG BEACH CONTAINER TERMINAL (PIER E); active (Valid to blank). FIRMS WAC8 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USLGB:W182` | Pacific Container Terminal | SSAPCT | W182 | TERMINALS row 1184: USLGB / SSAPCT / PACIFIC CONTAINER TERMINAL LONG BEACH (PIER J); active (Valid to blank). FIRMS W182 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USLGB:STA` | Shippers Transport Express | — | — | Shippers off-dock facility; no current SMDG match. STA is a 3-character integration alias, not FIRMS. No verified replacement found. |
| `USLGB:Z773` | Shippers Transport Express - Carson | — | Z773 | Shippers off-dock Carson facility; no current SMDG match. Retain existing FIRMS Z773. FIRMS Z773 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USLGB:Z978` | SSA Pier A | SSATA | Z978 | TERMINALS row 1185: USLGB / SSATA / SSA TERMINALS PIER A; active (Valid to blank). FIRMS Z978 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USLGB:Z952` | Total Terminals International | TTI | Z952 | TERMINALS row 1187: USLGB / TTI / TOTAL TERMINALS INTERNATIONAL (PIER T); active (Valid to blank). FIRMS Z952 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USLAX:W185` | APM Terminals | APMT | W185 | TERMINALS row 1176: USLAX / APMT / APM TERMINALS LOS ANGELES PIER 400; active (Valid to blank). FIRMS W185 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USLAX:Y124` | Everport Terminal Services | ETS | Y124 | TERMINALS row 1177: USLAX / ETS / EVERPORT CONTAINER TERMINAL (ETS); active (Valid to blank). FIRMS Y124 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USLAX:Y257` | Fenix Marine Services | EAGLE | Y257 | TERMINALS row 1178: USLAX / EAGLE / FENIX MARINE CONTAINER TERMINAL (FMS); active (Valid to blank). FIRMS Y257 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USLAX:Y258` | TraPac LA | TRAP | Y258 | TERMINALS row 1179: USLAX / TRAP / TRAPAC CONTAINER TERMINAL; active (Valid to blank). FIRMS Y258 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USLAX:Y773` | West Basin Container Terminal | WBCT | Y773 | TERMINALS row 1180: USLAX / WBCT / WEST BASIN CONTAINER TERMINAL (WBCT); active (Valid to blank). FIRMS Y773 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USLAX:Y790` | Yusen Terminals | YUSEN | Y790 | TERMINALS row 1181: USLAX / YUSEN / YUSEN CONTAINER TERMINAL (YTI); active (Valid to blank). FIRMS Y790 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USMIA:L239` | Port of Miami Terminal Operating Company | POM | L239 | TERMINALS row 1188: USMIA / POM / PORT OF MIAMI TERMINAL (POMTOC); active (Valid to blank). FIRMS L239 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USMIA:N775` | South Florida Container Terminal | SOU | N775 | TERMINALS row 1190: USMIA / SOU / SOUTH FLORIDA CONTAINER TERMINAL (SFCT); active (Valid to blank). FIRMS N775 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USMOB:R103` | APM Terminal | APMT | R103 | TERMINALS row 1191: USMOB / APMT / APM TERMINALS MOBILE; active (Valid to blank). FIRMS R103 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USMSY:P260` | Napoleon Container Terminal | NOLA | P260 | TERMINALS row 1192: USMSY / NOLA / NAPOLEON CONTAINER TERMINAL; active (Valid to blank). FIRMS P260 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USMSY:Q795` | New Orleans Terminal | NOT | Q795 | TERMINALS row 1193: USMSY / NOT / NEW ORLEANS TERMINAL (NOT); active (Valid to blank). FIRMS Q795 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USNYC:E364` | GCT Bayonne | GTC | E364 | TERMINALS row 1196: USNYC / GTC / GCT BAYONNE; active (Valid to blank). FIRMS E364 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USNYC:E005` | GCT New York LP | NYCT | E005 | TERMINALS row 1197: USNYC / NYCT / GCT NEW YORK; active (Valid to blank). Alternative UN/LOCODE USUYU. FIRMS E005 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USNYC:E416` | Maher Terminals | MAHER | E416 | TERMINALS row 1198: USNYC / MAHER / MAHER CONTAINER TERMINAL; active (Valid to blank). FIRMS E416 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USNYC:E425` | Port Elizabeth | APMT | E425 | TERMINALS row 1195: USNYC / APMT / APM TERMINALS ELIZABETH; active (Valid to blank). Alternative UN/LOCODE USEWR. Registry website is https://www.apmterminals.com/en/port-elizabeth ; facility APM Terminals Elizabeth, same Port Elizabeth record and USNYC/USEWR alias. FIRMS E425 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USNYC:F577` | Port Newark Container Terminal | PNCT | F577 | TERMINALS row 1199: USNYC / PNCT / PORT NEWARK CONTAINER TERMINAL; active (Valid to blank). Alternative UN/LOCODE USEWR. FIRMS F577 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USOAK:WBA5` | Ben E. Nutter Terminal | BENT | WBA5 | TERMINALS row 1202: USOAK / BENT / BEN E. NUTTER TERMINAL; active (Valid to blank). FIRMS WBA5 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USOAK:Z985` | Oakland International Container Terminal | B58 | Z985 | TERMINALS row 1204: USOAK / B58 / OAKLAND INTERNATIONAL CONTAINER TERMINAL (OICT); active (Valid to blank). FIRMS Z985 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USOAK:STO` | Shippers Transport Express | — | — | Shippers off-dock facility; no current SMDG match. STO is a 3-character integration alias, not FIRMS. No verified replacement found. |
| `USOAK:Y549` | TraPac Terminal | TPOAK | Y549 | TERMINALS row 1205: USOAK / TPOAK / TRAPAC CONTAINER TERMINAL; active (Valid to blank). FIRMS Y549 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USPHL:C095` | Packer Avenue | PAMT | C095 | TERMINALS row 1213: USPHL / PAMT / PACKER AVENUE MARINE TERMINAL; active (Valid to blank). FIRMS C095 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USPHL:B197` | Tioga Marine Terminal | — | B197 | No Tioga Marine Terminal match in current SMDG registry, including a search across all ports. Keep existing FIRMS B197. FIRMS B197 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USPEF:O664` | Port Everglades Terminal | PET | O664 | TERMINALS row 1212: USPEF / PET / PORT EVERGLADES TERMINAL; active (Valid to blank). FIRMS O664 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USPDX:X005` | Terminal 6 | PT6 | X005 | TERMINALS row 1208: USPDX / PT6 / PORTLAND TERMINAL 6; active (Valid to blank). FIRMS X005 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USSAV:L737` | Garden City Terminals | GCMT | L737 | TERMINALS row 1220: USSAV / GCMT / GARDEN CITY MARINE TERMINAL; active (Valid to blank). FIRMS L737 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USSEA:X117` | SSA Terminal 18 | SSA18 | X117 | TERMINALS row 1222: USSEA / SSA18 / SSA TERMINAL T18; active (Valid to blank). FIRMS X117 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USSEA:Y197` | SSA Terminal 30 | SSA30 | Y197 | TERMINALS row 1223: USSEA / SSA30 / SSA TERMINAL T30; active (Valid to blank). FIRMS Y197 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USSEA:Y400` | Terminal 5 | SSA5 | Y400 | TERMINALS row 1224: USSEA / SSA5 / SSA TERMINAL T5; active (Valid to blank). FIRMS Y400 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USTIW:Z693` | Husky Terminal | HUSKY | Z693 | TERMINALS row 1225: USTIW / HUSKY / HUSKY TERMINAL; active (Valid to blank). FIRMS Z693 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USTIW:X215` | Pierce County Terminal | PCT | X215 | TERMINALS row 1226: USTIW / PCT / PIERCE COUNTY TERMINAL (PCT); active (Valid to blank). FIRMS X215 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USTIW:Z705` | Washington United Terminals | WUT | Z705 | TERMINALS row 1227: USTIW / WUT / WASHINGTON UNITED TERMINALS (WUT); active (Valid to blank). FIRMS Z705 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USTIW:X335` | West Sitcum Terminal (Matson) | WSIT | X335 | TERMINALS row 1228: USTIW / WSIT / WEST SITCUM TERMINAL; active (Valid to blank). FIRMS X335 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USTPA:M669` | Tampa Bay Container Terminal | PTCT | M669 | TERMINALS row 1229: USTPA / PTCT / TAMPA CONTAINER TERMINAL; active (Valid to blank). FIRMS M669 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USORF:L005` | Norfolk International Terminals | NIT | L005 | TERMINALS row 1206: USORF / NIT / NORFOLK INTERNATIONAL TERMINALS (NIT); active (Valid to blank). FIRMS L005 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USORF:L045` | Portsmouth Marine Terminal | — | L045 | Registry lists PMT under USPTM only; docs record is USORF. Blank avoids publishing an invalid port+SMDG combination. Official port describes facility as converted to heavy-lift/offshore wind; coverage registry needs separate review. FIRMS L045 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USORF:N195` | Virginia International Gateway | VIG | N195 | TERMINALS row 1217: USPTM / VIG / VIRGINIA INTERNATIONAL GATEWAY (VIG); active (Valid to blank). Alternative UN/LOCODE USORF. Registry primary USPTM, explicit alternative USORF; code VIG therefore valid under existing docs port. FIRMS N195 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `USILM:L194` | Port of Wilmington Container Terminal | NCSPA | L194 | TERMINALS row 1170: USILM / NCSPA / PORT OF WILMINGTON (NC) TERMINAL; active (Valid to blank). FIRMS L194 retained from existing approved Terminal49 public coverage registry; not reverified with CBP. |
| `NZLYT:NZLYTLPC` | Lyttelton Port Company | LPC | — | TERMINALS row 902: NZLYT / LPC / LYTTELTON PORT COMPANY; active (Valid to blank). |
| `NZTIU:NZTIUTCTL` | Timaru Container Terminal | TCTL | — | TERMINALS row 909: NZTIU / TCTL / TIMARU CONTAINER TERMINAL; active (Valid to blank). |

## Updating identifiers

Edit `terminal-identifiers.json` after verifying the terminal name and primary or alternative port UN/LOCODE against the current registry. Its keys use the legacy source terminal code, falling back to the terminal name when blank. Do not change that key when correcting SMDG or FIRMS values. Blank means unlisted or unresolved, not unsupported. Keep non-US FIRMS values blank.

Apply identifier changes to the matching rows in `docs/data/coverage/coverage.json`, then run `node tools/generate-coverage.mjs` and `npm run test:coverage`. Hex imports apply this identifier mapping independently of observed feature coverage. Update this evidence file with the registry version, source row, and any identity ambiguity.
