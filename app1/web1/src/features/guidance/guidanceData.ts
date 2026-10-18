import type { GuidanceTopic } from '@healthsetu/contracts';

export const GUIDANCE_TOPICS: GuidanceTopic[] = [
  {
    id: 'ors-dehydration',
    category: 'FIRST_AID',
    title: {
      en: 'ORS Preparation & Child Dehydration',
      hi: 'ओआरएस (ORS) बनाने की विधि और निर्जलीकरण',
      mr: 'ओआरएस (ORS) तयार करण्याची पद्धत आणि डिहायड्रेशन',
    },
    keywords: [
      'ors',
      'dehydration',
      'diarrhea',
      'loose motion',
      'vomiting',
      'salt sugar solution',
      'ओआरएस',
      'दस्त',
      'उल्टी',
      'जीवनरक्षक घोल',
      'जुलाब',
      'उलट्या',
      'जलसंजीवनी',
    ],
    summary: {
      en: 'Immediate home rehydration for diarrhea and vomiting in children and adults using Oral Rehydration Salts (ORS) or homemade sugar-salt solution.',
      hi: 'बच्चों और बड़ों में दस्त और उल्टी होने पर ओआरएस या घर पर बने नमक-चीनी के घोल से तुरंत पानी की कमी दूर करें।',
      mr: 'लहान मुलांमध्ये व प्रौढांमध्ये जुलाब आणि उलट्या झाल्यास ओआरएस किंवा घरातील मीठ-साखर द्रावणाने त्वरित जलसंजीवनी द्यावी.',
    },
    keySteps: [
      {
        step: 1,
        text: {
          en: 'Wash your hands thoroughly with soap and clean water before preparation.',
          hi: 'घोल बनाने से पहले अपने हाथों को साबुन और साफ पानी से अच्छी तरह धोएं।',
          mr: 'द्रावण तयार करण्यापूर्वी हात साबण आणि स्वच्छ पाण्याने धुवून घ्यावेत.',
        },
      },
      {
        step: 2,
        text: {
          en: 'Boil 1 liter of clean drinking water and let it cool to room temperature.',
          hi: '1 लीटर साफ पीने का पानी उबालें और उसे सामान्य तापमान पर ठंडा होने दें।',
          mr: '१ लिटर स्वच्छ पिण्याचे पाणी उकळून सामान्य तापमानाला थंड होऊ द्यावे.',
        },
      },
      {
        step: 3,
        text: {
          en: 'Mix either one full standard WHO-ORS packet OR add 6 level teaspoons of sugar and 1/2 level teaspoon of salt into the 1 liter of water.',
          hi: '1 लीटर पानी में एक पूरा डब्ल्यूएचओ-ओआरएस पैकेट मिलाएं या 6 चम्मच चीनी और 1/2 चम्मच नमक घोलें।',
          mr: '१ लिटर पाण्यात एक संपूर्ण डब्लूएचओ-ओआरएस पाकीट किंवा ६ लहान चमचे साखर व १/२ चमचा मीठ पूर्ण विरघळेपर्यंत ढवळावे.',
        },
      },
      {
        step: 4,
        text: {
          en: 'Stir until completely dissolved. Give small, frequent sips using a clean cup and spoon. Discard any solution after 24 hours.',
          hi: 'अच्छी तरह घोलें। साफ कप और चम्मच से बच्चे को थोड़ी-थोड़ी देर में घूंट पिलाएं। 24 घंटे बाद बचा घोल फेंक दें।',
          mr: 'स्वच्छ वाटी व चमच्याने थोडे-थोडे घोट पाजावेत. २४ तासांनंतर उरलेले द्रावण फेकून द्यावे आणि नवीन बनवावे.',
        },
      },
    ],
    emergencyWarning: {
      en: 'RUSH TO PHC / CALL 108 if: child is unusually sleepy/unconscious, eyes are deeply sunken, cannot drink, or blood is present in stools.',
      hi: 'तुरंत अस्पताल जाएं / 108 डायल करें यदि: बच्चा अत्यधिक सुस्त या बेहोश है, आंखें धंसी हुई हैं, पी नहीं पा रहा है, या मल में खून आ रहा है।',
      mr: 'तातडीने दवाखान्यात जा / १०८ वर फोन करा जर: बाळ जास्त सुस्त किंवा बेशुद्ध असेल, डोळे खोल गेले असतील, पाणी पिऊ शकत नसेल किंवा संडासमध्ये रक्त येत असेल.',
    },
    dos: [
      {
        en: 'Continue breastfeeding infants frequently throughout diarrhea.',
        hi: 'दस्त के दौरान भी शिशु को बार-बार स्तनपान कराते रहें।',
        mr: 'जुलाब सुरू असतानाही बाळाला वारंवार स्तनपान सुरू ठेवावे.',
      },
      {
        en: 'Give zinc supplement (20mg daily for 14 days) as advised by ASHA/Doctor.',
        hi: 'आशा कार्यकर्ता/डॉक्टर की सलाह से 14 दिनों तक जिंक की गोली दें।',
        mr: 'आशा ताई किंवा डॉक्टरांच्या सल्ल्यानुसार १४ दिवस झिंक गोळी द्यावी.',
      },
    ],
    donts: [
      {
        en: 'Do NOT give commercial sugary sodas, tea, or pure honey to dehydrated infants.',
        hi: 'शिशु को मीठे कोल्ड ड्रिंक्स, चाय या कच्चा शहद न दें।',
        mr: 'लहान बाळाला गोड शीतपेये, चहा किंवा कच्चा मध देऊ नये.',
      },
      {
        en: 'Do NOT stop giving fluids or food during illness.',
        hi: 'बीमारी के दौरान तरल पदार्थ या खाना देना बंद न करें।',
        mr: 'आजाराच्या काळात द्रवपदार्थ किंवा आहार देणे बंद करू नका.',
      },
    ],
  },
  {
    id: 'snakebite-first-aid',
    category: 'FIRST_AID',
    title: {
      en: 'First Aid for Snakebite (Right Do’s and Don’ts)',
      hi: 'सांप के काटने पर प्राथमिक उपचार (सही नियम)',
      mr: 'साप चावल्यास तात्काळ प्रथमोपचार (योग्य पद्धती)',
    },
    keywords: [
      'snakebite',
      'snake',
      'venom',
      'poison',
      'first aid',
      'सर्पदंश',
      'सांप',
      'विष',
      'साप चावणे',
      'विंचू',
    ],
    summary: {
      en: 'Essential protocol for suspected venomous snakebite: keep the victim calm, immobilize the limb, and reach the nearest PHC/Hospital with Anti-Snake Venom (ASV) immediately.',
      hi: 'सांप काटने पर तुरंत पीड़ित को शांत रखें, अंग को स्थिर करें और एंटी-स्नेक वेनम (ASV) वाले नजदीकी अस्पताल ले जाएं।',
      mr: 'साप चावल्यास रुग्णाला शांत ठेवा, चावलेला हात किंवा पाय हलवू नका आणि तातडीने अँटी-व्हेनम (ASV) उपलब्ध असलेल्या जवळच्या रुग्णालयात न्या.',
    },
    keySteps: [
      {
        step: 1,
        text: {
          en: 'Reassure the victim. Over 70% of snakebites are non-venomous or dry bites. Panic increases heart rate and speeds venom spread.',
          hi: 'पीड़ित को ढांढस बंधाएं और शांत रखें। 70% से अधिक सांप जहरीले नहीं होते। घबराहट से दिल की धड़कन तेज होती है और जहर तेजी से फैलता है।',
          mr: 'रुग्णाला धीर द्या आणि शांत ठेवा. ७०% साप बिनविषारी असतात. भीतीमुळे हृदयाचे ठोके वाढून विष लवकर पसरू शकते.',
        },
      },
      {
        step: 2,
        text: {
          en: 'Immobilize the affected limb using a broad splint or cloth sling, keeping it at or slightly below heart level. Remove rings, bangles, and tight clothing.',
          hi: 'काटे गए हाथ या पैर पर लकड़ी की पट्टी या कपड़े से सहारा देकर स्थिर करें। अंगूठी, चूड़ियां और तंग कपड़े तुरंत उतारें।',
          mr: 'चावलेला हात किंवा पाय काठीचा किंवा कापडाचा आधार देऊन स्थिर ठेवा. अंगठ्या, बांगड्या आणि घट्ट कपडे त्वरित काढा.',
        },
      },
      {
        step: 3,
        text: {
          en: 'Note the time of bite and any symptoms (drooping eyelids, difficulty swallowing, local swelling). Do not waste time trying to catch or kill the snake.',
          hi: 'काटने का समय और लक्षण (पलकें झुकना, निगलने में परेशानी, सूजन) नोट करें। सांप को पकड़ने में समय बर्बाद न करें।',
          mr: 'चावल्याची वेळ व लक्षणे (डोळे जड होणे, गिळण्यास त्रास, सूज) लक्षात ठेवा. सापाला पकडण्यात वेळ वाया घालवू नका.',
        },
      },
      {
        step: 4,
        text: {
          en: 'Transport the victim IMMEDIATELY in a vehicle to the nearest CHC, Sub-District Hospital, or PHC equipped with Anti-Snake Venom (ASV).',
          hi: 'पीड़ित को बिना देरी किए वाहन से नजदीकी अस्पताल या स्वास्थ्य केंद्र ले जाएं जहां एंटी-स्नेक वेनम उपलब्ध हो।',
          mr: 'रुग्णाला कोणत्याही वाहनाने तात्काळ अँटी-व्हेनम (ASV) औषध उपलब्ध असलेल्या जवळच्या सरकारी रुग्णालयात घेऊन जा.',
        },
      },
    ],
    emergencyWarning: {
      en: 'DO NOT CUT, DO NOT SUCK VENOM, DO NOT APPLY A TIGHT TOURNIQUET, AND DO NOT GO TO FAITH HEALERS. Call 108 immediately.',
      hi: 'घाव पर चीरा न लगाएं, मुंह से जहर न चूसें, तंग रस्सी न बांधें, और झाड़-फूंक में समय न गंवाएं। तुरंत 108 डायल करें।',
      mr: 'जखमेवर काप मारू नका, तोंड लावून विष चोखू नका, दोरीने घट्ट बांधू नका आणि मांत्रिकाकडे जाऊ नका. लगेच १०८ वर संपर्क करा.',
    },
    dos: [
      {
        en: 'Keep the patient still and resting during transport.',
        hi: 'अस्पताल ले जाते समय मरीज को आराम की स्थिति में रखें।',
        mr: 'दवाखान्यात नेताना रुग्णाला विश्रांतीच्या स्थितीत हलवू न देता न्या.',
      },
      {
        en: 'Inform the receiving doctor of local swelling or breathing difficulties.',
        hi: 'डॉक्टर को सूजन या सांस लेने में परेशानी के बारे में तुरंत बताएं।',
        mr: 'डॉक्टरांना सूज व श्वास घेण्याच्या त्रासाबद्दल त्वरित माहिती द्या.',
      },
    ],
    donts: [
      {
        en: 'Do NOT apply ice packs, potassium permanganate, or electric shocks.',
        hi: 'बर्फ, रसायनों या बिजली के झटके का प्रयोग न करें।',
        mr: 'बर्फ, रसायने किंवा जडीबुटी जखमेवर लावू नका.',
      },
      {
        en: 'Do NOT give alcoholic drinks or sedatives.',
        hi: 'पीड़ित को शराब या नींद की दवाएं न दें।',
        mr: 'रुग्णाला मद्य किंवा गुंगीचे औषध देऊ नका.',
      },
    ],
  },
  {
    id: 'maternal-danger-signs',
    category: 'MATERNAL_CHILD',
    title: {
      en: 'Maternal Danger Signs during Pregnancy & Delivery',
      hi: 'गर्भावस्था और प्रसव के दौरान खतरे के लक्षण',
      mr: 'गरोदरपण आणि बाळंतपणातील धोक्याची लक्षणे',
    },
    keywords: [
      'pregnancy',
      'maternal',
      'bleeding',
      'headache',
      'eclampsia',
      'delivery',
      'गर्भावस्था',
      'प्रसव',
      'रक्तस्राव',
      'सिरदर्द',
      'गरोदर',
      'रक्तस्त्राव',
      'बाळंतपण',
    ],
    summary: {
      en: 'Identification of critical obstetric red flags during pregnancy that require immediate emergency referral to a First Referral Unit (FRU) or District Hospital.',
      hi: 'गर्भावस्था के दौरान गंभीर खतरों की पहचान जिन्हें तुरंत 108 एम्बुलेंस और अस्पताल की आवश्यकता होती है।',
      mr: 'गरोदरपणातील धोक्याच्या गंभीर लक्षणांची ओळख ज्यासाठी तात्काळ १०८ रुग्णवाहिका व रुग्णालयाची गरज असते.',
    },
    keySteps: [
      {
        step: 1,
        text: {
          en: 'Monitor for Severe Red Flags: Vaginal bleeding (any amount), severe headache with blurred vision, sudden swelling of hands and face, or fits/convulsions.',
          hi: 'खतरे के लक्षण पहचानें: योनि से रक्तस्राव, धुंधली दृष्टि के साथ तेज सिरदर्द, चेहरे-हाथों पर अचानक सूजन, या दौरे/झटके आना।',
          mr: 'धोक्याची लक्षणे ओळखा: रक्तस्त्राव, अंधुक दिसायला लागून तीव्र डोकेदुखी, चेहऱ्यावर व हातांवर सूज येणे किंवा झटके/फेफरे येणे.',
        },
      },
      {
        step: 2,
        text: {
          en: 'Check fetal movements: If baby moves less than 10 times in 12 hours during late pregnancy, seek immediate assessment.',
          hi: 'शिशु की हलचल जांचें: यदि गर्भावस्था के अंतिम महीनों में 12 घंटे में 10 से कम बार हलचल हो, तो तुरंत जांच कराएं।',
          mr: 'बाळाची हालचाल तपासा: १२ तासांत बाळ १० पेक्षा कमी वेळा हालचाल करत असल्यास त्वरित डॉक्टरांकडे जा.',
        },
      },
      {
        step: 3,
        text: {
          en: 'Check for leakage of water (premature rupture of membranes) or prolonged labor pains (>12 hours).',
          hi: 'पानी की थैली फटना या 12 घंटे से अधिक समय तक प्रसव पीड़ा बने रहना अस्पताल जाने का संकेत है।',
          mr: 'अंगचे पाणी जाणे किंवा १२ तासांपेक्षा जास्त वेळ प्रसूती कळा सुरू राहणे हे दवाखान्यात नेण्याचे लक्षण आहे.',
        },
      },
      {
        step: 4,
        text: {
          en: 'Call 108 ambulance immediately. Inform ASHA / ANM to accompany the pregnant woman to the hospital.',
          hi: 'तुरंत 108 एम्बुलेंस बुलाएं। आशा या एएनएम कार्यकर्ता को साथ ले जाने के लिए सूचित करें।',
          mr: 'लगेच १०८ रुग्णवाहिका बोलवा आणि आशा ताई किंवा एएनएम यांना सोबत येण्यास सांगा.',
        },
      },
    ],
    emergencyWarning: {
      en: 'FITS / CONVULSIONS during pregnancy (Eclampsia) or ACTIVE VAGINAL BLEEDING is a life-threatening emergency. Call 108 immediately.',
      hi: 'गर्भावस्था में दौरे आना (एक्लेम्पसिया) या रक्तस्राव होना जानलेवा हो सकता है। तुरंत 108 पर कॉल करें।',
      mr: 'गरोदरपणात फेफरे येणे किंवा जास्त रक्तस्त्राव होणे अत्यंत धोकादायक असते. ताबडतोब १०८ वर संपर्क करा.',
    },
  },
  {
    id: 'immunization-schedule',
    category: 'MATERNAL_CHILD',
    title: {
      en: 'Infant Vaccination Schedule (National Immunization Schedule)',
      hi: 'शिशु टीकाकरण सारिणी (राष्ट्रीय टीकाकरण कार्यक्रम)',
      mr: 'लहान मुलांचे लसीकरण वेळापत्रक (राष्ट्रीय कार्यक्रम)',
    },
    keywords: [
      'vaccination',
      'immunization',
      'bcg',
      'polio',
      'pentavalent',
      'measles',
      'mr',
      'टीकाकरण',
      'पोलियो',
      'खसरा',
      'लसीकरण',
      'पोलिओ',
      'गोवर',
    ],
    summary: {
      en: 'Timetable of government-approved vaccines given free at all Anganwadis, Sub-Centres, and PHCs across India.',
      hi: 'भारत सरकार द्वारा सभी आंगनवाड़ी, उप-स्वास्थ्य केंद्रों और प्राथमिक स्वास्थ्य केंद्रों पर मुफ्त लगने वाले टीकों की समय सारिणी।',
      mr: 'सर्व अंगणवाडी, उपकेंद्र व प्राथमिक आरोग्य केंद्रांवर मोफत दिल्या जाणाऱ्या शासकीय लसींचे वेळापत्रक.',
    },
    keySteps: [
      {
        step: 1,
        text: {
          en: 'At Birth: BCG (Tuberculosis), OPV-0 (Polio drops), and Hepatitis B birth dose within 24 hours of delivery.',
          hi: 'जन्म के समय: बीसीजी (टीबी), ओपीवी-0 (पोलियो बूंदें), और 24 घंटे के अंदर हेपेटाइटिस बी का पहला टीका।',
          mr: 'जन्माच्या वेळी: बीसीजी (टीबी), पोलिओ डोस ०, आणि २४ तासांच्या आत हेपेटायटिस-बी लस.',
        },
      },
      {
        step: 2,
        text: {
          en: 'At 6, 10, and 14 Weeks: Pentavalent (DPT + Hep B + Hib), Oral Rotavirus vaccine, Fractional IPV (Polio injection), and PCV.',
          hi: '6, 10 और 14 सप्ताह पर: पेंटावेलेंट, रोटावायरस की बूंदें, आईपीवी इंजेक्शन और पीसीवी का टीका।',
          mr: '६, १० आणि १४ व्या आठवड्यात: पेंटाव्हॅलेंट लस, रोटाव्हायरस थेंब, पोलिओ इंजेक्शन (IPV) आणि न्युमोकोकल (PCV) लस.',
        },
      },
      {
        step: 3,
        text: {
          en: 'At 9 to 12 Months: MR-1 (Measles-Rubella), JE-1, PCV Booster, and Vitamin A syrup (First dose).',
          hi: '9 से 12 महीने पर: एमआर-1 (खसरा-रूबेला), जापानी एन्सेफलाइटिस, पीसीवी बूस्टर और विटामिन ए सिरप की पहली खुराक।',
          mr: '९ ते १२ महिन्यांत: गोवर-रुबेला (MR-1), मेंदूज्वर (JE-1), व्हिटॅमिन-ए चा पहिला डोस आणि PCV बूस्टर.',
        },
      },
      {
        step: 4,
        text: {
          en: 'At 16 to 24 Months: DPT Booster 1, MR-2, OPV Booster, and Vitamin A (2nd dose). Keep the MCP / RCH immunization card safe.',
          hi: '16 से 24 महीने पर: डीपीटी बूस्टर 1, एमआर-2, पोलियो बूस्टर और विटामिन ए की दूसरी खुराक। एमसीपी कार्ड सुरक्षित रखें।',
          mr: '१६ ते २४ महिन्यांत: डीपीटी बूस्टर १, गोवर-रुबेला २, पोलिओ बूस्टर व व्हिटॅमिन-ए डोस २. आरसीएच कार्ड जपून ठेवा.',
        },
      },
    ],
  },
  {
    id: 'burns-first-aid',
    category: 'FIRST_AID',
    title: {
      en: 'First Aid for Thermal & Hot Liquid Burns',
      hi: 'जलने और गर्म तरल से झुलसने पर प्राथमिक उपचार',
      mr: 'आगीने किंवा गरम पाण्याने भाजल्यास प्रथमोपचार',
    },
    keywords: [
      'burn',
      'burns',
      'fire',
      'hot water',
      'scald',
      'blister',
      'जलना',
      'आग',
      'छाला',
      'भाजणे',
      'फोड',
    ],
    summary: {
      en: 'Immediate emergency cooling protocols for burns to stop tissue damage and prevent severe infections.',
      hi: 'जलने पर तुरंत ठंडे पानी से त्वचा को ठंडा करने और संक्रमण रोकने के आवश्यक नियम।',
      mr: 'भाजल्यास तात्काळ वाहत्या थंड पाण्याने जखम शांत करण्याचे आणि संसर्ग रोखण्याचे महत्त्वाचे नियम.',
    },
    keySteps: [
      {
        step: 1,
        text: {
          en: 'Immediately pour cool, gentle running tap water over the burned area for 15 to 20 minutes. Do not use freezing ice or ice water.',
          hi: 'तुरंत जले हुए स्थान पर 15 से 20 मिनट तक सामान्य ठंडा नल का पानी डालें। बर्फ या बहुत ठंडे पानी का इस्तेमाल न करें।',
          mr: 'भाजलेल्या भागावर ताबडतोब १५ ते २० मिनिटे नळाचे थंड पाणी ओतावे. बर्फ किंवा अतिथंड पाणी लावू नये.',
        },
      },
      {
        step: 2,
        text: {
          en: 'Gently remove rings, watches, or loose clothing before swelling starts. Do NOT pull off clothes that are stuck to the skin.',
          hi: 'सूजन आने से पहले अंगूठी, घड़ी या ढीले कपड़े धीरे से उतारें। त्वचा पर चिपके कपड़े को जबरदस्ती न खींचें।',
          mr: 'सूज येण्यापूर्वी अंगठ्या, घड्याळ किंवा सैल कपडे काढा. त्वचेला चिकटलेले कपडे ओढून काढू नका.',
        },
      },
      {
        step: 3,
        text: {
          en: 'Cover loosely with a clean, dry cloth or sterile cling wrap. Do NOT pop blisters.',
          hi: 'साफ, सूखे कपड़े या जीवाणुरहित पट्टी से ढीला ढकें। फफोलों को बिल्कुल न फोड़ें।',
          mr: 'स्वच्छ आणि कोरड्या कापडाने हलके झाकून ठेवा. भाजलेले फोड फोडू नका.',
        },
      },
      {
        step: 4,
        text: {
          en: 'Take the patient to the nearest PHC or Hospital for sterile dressing and tetanus evaluation.',
          hi: 'मरीज को साफ ड्रेसिंग और टिटनेस के टीके की जांच के लिए तुरंत नजदीकी अस्पताल ले जाएं।',
          mr: 'जखमेची मलमपट्टी व धनुर्वात (धनुर्वाताचे इंजेक्शन) तपासणीसाठी रुग्णालयात घेऊन जा.',
        },
      },
    ],
    emergencyWarning: {
      en: 'DO NOT APPLY toothpaste, cow dung, ink, ghee, or turmeric. These cause dangerous bacterial infections.',
      hi: 'जले पर टूथपेस्ट, गोबर, स्याही, घी या हल्दी कभी न लगाएं। इससे गंभीर संक्रमण हो सकता है।',
      mr: 'जखमेवर टूथपेस्ट, शेण, शाई, तूप किंवा हळद लावू नका. यामुळे संसर्ग (इन्फेक्शन) होऊन धोका वाढतो.',
    },
  },
  {
    id: 'tb-screening-dots',
    category: 'INFECTIOUS_DISEASES',
    title: {
      en: 'Tuberculosis (TB) Symptoms & Free Government Treatment (DOTS)',
      hi: 'टीबी (क्षयरोग) के लक्षण और मुफ्त सरकारी इलाज (निक्षय / डॉट्स)',
      mr: 'टीबी (क्षयरोग) लक्षणे आणि मोफत शासकीय उपचार (निक्षय योजना)',
    },
    keywords: [
      'tb',
      'tuberculosis',
      'cough',
      'sputum',
      'dots',
      'nikshay',
      'टीबी',
      'खांसी',
      'बलगम',
      'क्षयरोग',
      'खोकला',
      'कफ',
    ],
    summary: {
      en: 'Recognizing early symptoms of pulmonary TB and accessing 100% free diagnosis, sputum testing (CBNAAT/TrueNat), and daily medications under the National TB Elimination Programme (NTEP).',
      hi: 'टीबी के शुरुआती लक्षणों को पहचानें और राष्ट्रीय क्षय उन्मूलन कार्यक्रम के तहत मुफ्त जांच और दवाएं प्राप्त करें।',
      mr: 'टीबीची लक्षणे ओळखून राष्ट्रीय कार्यक्रमांतर्गत मोफत थुंकी तपासणी व नियमित मोफत औषधोपचार मिळवा.',
    },
    keySteps: [
      {
        step: 1,
        text: {
          en: 'Recognize the 4 classic symptoms: Persistent cough for more than 2 weeks, continuous evening fever, unexplained weight loss, and night sweats.',
          hi: 'मुख्य 4 लक्षण पहचानें: 2 सप्ताह से अधिक खांसी, शाम के समय बुखार, लगातार वजन कम होना और रात में पसीना आना।',
          mr: '४ मुख्य लक्षणे ओळखा: २ आठवड्यांपेक्षा जास्त खोकला, संध्याकाळी बारीक ताप, वजन कमी होणे आणि रात्री घाम येणे.',
        },
      },
      {
        step: 2,
        text: {
          en: 'Visit the nearest PHC or ASHA worker for free Sputum Examination and TrueNat / CBNAAT molecular testing.',
          hi: 'मुफ्त बलगम जांच और ट्रूनेट (TrueNat) परीक्षण के लिए नजदीकी प्राथमिक स्वास्थ्य केंद्र या आशा कार्यकर्ता से संपर्क करें।',
          mr: 'मोफत थुंकी व ट्रूनेट तपासणीसाठी जवळच्या प्राथमिक आरोग्य केंद्राशी किंवा आशा ताईंशी संपर्क साधा.',
        },
      },
      {
        step: 3,
        text: {
          en: 'Complete the full course of medicines (usually 6 months). Never stop medicines early even if feeling completely well.',
          hi: 'दवाइयों का पूरा कोर्स (आमतौर पर 6 महीने) पूरा करें। ठीक लगने पर भी दवा बीच में न छोड़ें।',
          mr: '६ महिन्यांचा औषधांचा पूर्ण कोर्स पूर्ण करा. बरे वाटले तरीही औषध मध्येच थांबवू नका.',
        },
      },
      {
        step: 4,
        text: {
          en: 'Register under Nikshay Poshan Yojana for ₹500/month direct benefit transfer for nutritional support during treatment.',
          hi: 'इलाज के दौरान पोषण सहायता के लिए निक्षय पोषण योजना (₹500/माह बैंक खाते में) का लाभ लें।',
          mr: 'उपचारादरम्यान पोषक आहारासाठी निक्षय पोषण योजनेअंतर्गत दरमहा ₹५०० बँक खात्यात मिळतात.',
        },
      },
    ],
  },
  {
    id: 'dengue-malaria-prevention',
    category: 'INFECTIOUS_DISEASES',
    title: {
      en: 'Dengue & Malaria: Prevention and Danger Signs',
      hi: 'डेंगू और मलेरिया: बचाव और खतरे के लक्षण',
      mr: 'डेंग्यू आणि मलेरिया: प्रतिबंध आणि धोक्याची लक्षणे',
    },
    keywords: [
      'dengue',
      'malaria',
      'mosquito',
      'platelet',
      'fever',
      'डेंगू',
      'मलेरिया',
      'मच्छर',
      'प्लेटलेट्स',
      'ताप',
      'हिवताप',
    ],
    summary: {
      en: 'Vector-borne illness precautions in monsoon/post-monsoon seasons, eliminating mosquito breeding, and identifying bleeding signs.',
      hi: 'मच्छर जनित बीमारियों से बचाव, पानी जमा न होने देने के उपाय और प्लेटलेट्स कम होने के खतरे के संकेत।',
      mr: 'डासांमुळे होणाऱ्या आजारांपासून बचाव, पाणी साचू न देणे आणि रक्तस्त्रावाच्या धोक्याची लक्षणे ओळखणे.',
    },
    keySteps: [
      {
        step: 1,
        text: {
          en: 'Empty, scrub, and dry all water storage containers, air coolers, tires, and pots once a week (Dry Day observance).',
          hi: 'हफ्ते में एक बार कूलर, टंकियों और बर्तनों का पानी पूरी तरह खाली कर सुखाएं (ड्राई डे मनाएं)।',
          mr: 'आठवड्यातून एकदा कुलर, पाण्याचे ड्रम व भांडी पूर्ण रिकामी करून कोरडी करावीत (ड्राय डे पाळावा).',
        },
      },
      {
        step: 2,
        text: {
          en: 'Sleep under insecticide-treated bed nets (ITNs) and wear long-sleeved clothes during dawn and dusk.',
          hi: 'मच्छरदानी का इस्तेमाल करें और सुबह-शाम पूरे आस्तीन के कपड़े पहनें।',
          mr: 'मच्छरदाणीचा वापर करा आणि सकाळी व संध्याकाळी अंगाला झाकणारे पूर्ण कपडे घाला.',
        },
      },
      {
        step: 3,
        text: {
          en: 'Get a rapid blood test for Malaria and Dengue at the PHC within 24 hours of starting fever.',
          hi: 'बुखार शुरू होने के 24 घंटे के भीतर प्राथमिक स्वास्थ्य केंद्र पर मलेरिया और डेंगू की मुफ्त जांच कराएं।',
          mr: 'ताप आल्यास २४ तासांच्या आत जवळच्या आरोग्य केंद्रात रक्त तपासणी करून घ्या.',
        },
      },
      {
        step: 4,
        text: {
          en: 'Watch for Dengue Warning Signs: Bleeding gums/nose, black stools, persistent vomiting, severe belly pain. Rush to hospital immediately.',
          hi: 'डेंगू के खतरे: मसूड़ों या नाक से खून, काला मल, लगातार उल्टी, पेट में तेज दर्द। तुरंत अस्पताल पहुंचे।',
          mr: 'डेंग्यूचे धोके: हिरड्यांमधून किंवा नाकातून रक्त येणे, काळी संडास होणे, सतत उलट्या, पोटात तीव्र वेदना. लगेच रुग्णालयात जा.',
        },
      },
    ],
    emergencyWarning: {
      en: 'NEVER take Aspirin, Ibuprofen, or Brufen for suspected Dengue fever as they increase risk of internal bleeding. Use Paracetamol only.',
      hi: 'डेंगू के संदेह में कभी भी एस्पिरिन या ब्रूफेन न लें, इससे रक्तस्राव का खतरा बढ़ जाता है। केवल पैरासिटामोल लें।',
      mr: 'डेंग्यूचा संशय असल्यास ॲस्पिरिन किंवा आयबुप्रोफेन घेऊ नका, यामुळे रक्तस्त्राव होऊ शकतो. फक्त पॅरासिटामॉल वापरा.',
    },
  },
  {
    id: 'nutrition-poshan',
    category: 'HYGIENE_NUTRITION',
    title: {
      en: 'Infant Nutrition & Anemia Prevention (Poshan Abhiyaan)',
      hi: 'शिशु पोषण और एनीमिया की रोकथाम (पोषण अभियान)',
      mr: 'बाळाचे पोषण आणि ॲनिमिया प्रतिबंध (पोषण अभियान)',
    },
    keywords: [
      'nutrition',
      'breastfeeding',
      'anemia',
      'iron',
      'anganwadi',
      'poshan',
      'पोषण',
      'स्तनपान',
      'एनीमिया',
      'आयरन',
      'अंगणवाडी',
      'रक्तक्षय',
    ],
    summary: {
      en: 'Best nutritional practices for the first 1000 days of life: exclusive breastfeeding for 6 months, complementary feeding with local grains, and Iron-Folic Acid supplementation.',
      hi: 'जीवन के पहले 1000 दिनों में पोषण: 6 महीने तक केवल स्तनपान, उसके बाद पौष्टिक पूरक आहार और आयरन सिरप।',
      mr: 'आयुष्याच्या पहिल्या १००० दिवसांतील पोषण: ६ महिने फक्त स्तनपान, त्यानंतर स्थानिक पौष्टिक आहार आणि लोहयुक्त पूरक औषधे.',
    },
    keySteps: [
      {
        step: 1,
        text: {
          en: 'Exclusive breastfeeding for the first 6 months: Do not give water, honey, animal milk, or gripe water.',
          hi: 'शुरुआती 6 महीने केवल मां का दूध: पानी, शहद, गाय-भैंस का दूध या घुट्टी बिल्कुल न दें।',
          mr: 'पहिले ६ महिने फक्त आणि फक्त आईचे दूध: पाणी, मध, जनावरांचे दूध किंवा गुटी अजिबात देऊ नका.',
        },
      },
      {
        step: 2,
        text: {
          en: 'Start complementary feeding at completed 6 months: Mashed khichdi with ghee, mashed dal, banana, seasonal vegetables along with breastfeeding.',
          hi: '6 महीने पूरे होने पर ऊपरी आहार शुरू करें: घी वाली पतली खिचड़ी, मसली दाल, केला, मौसमी सब्जियां और साथ में स्तनपान।',
          mr: '६ महिने पूर्ण झाल्यावर पूरक आहार सुरू करा: तूप टाकलेली मऊ खिचडी, डाळ-भात, केळे, उकडलेल्या भाज्या व स्तनपान.',
        },
      },
      {
        step: 3,
        text: {
          en: 'Prevent anemia: Give Iron-Folic Acid (IFA) syrup to infants and tablets to pregnant mothers as provided by Anganwadi.',
          hi: 'खून की कमी से बचाव: आंगनवाड़ी से मिलने वाला आयरन-फोलिक एसिड सिरप बच्चों को और गोलियां गर्भवती महिलाओं को दें।',
          mr: 'रक्ताची कमतरता टाळा: अंगणवाडीतून मिळणारे आयर्न सिरप बाळाला आणि गोळ्या गरोदर मातेला न चुकता द्या.',
        },
      },
      {
        step: 4,
        text: {
          en: 'Attend monthly Village Health, Sanitation and Nutrition Day (VHSND) for child growth monitoring on the MCP card.',
          hi: 'हर महीने ग्राम स्वास्थ्य एवं पोषण दिवस (VHSND) पर बच्चे का वजन और विकास अवश्य नपवाएं।',
          mr: 'दरमहा ग्राम आरोग्य व पोषण दिनी (VHSND) बाळाचे वजन करून विकास तक्त्यावर नोंद करून घ्या.',
        },
      },
    ],
  },
];
