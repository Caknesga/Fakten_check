const DEMO_CASES = [
  {
    id: "spiegel",
    title: "Drone strike on a Russian industrial site",
    url: "https://www.spiegel.de/wirtschaft/ukraine-schiesst-grosses-russisches-industriegebiet-in-brand-a-6fbf0df7-642d-47c8-a121-4f68d281d873",
    claims: [
      {
        quote: "Angriffsdrohnen haben ein wichtiges russisches Industriegebiet 1000 Kilometer östlich von Moskau getroffen.",
        translation: "Attack drones struck an important Russian industrial area 1,000 kilometers east of Moscow.",
        verdict: "wahr", // Supported
        explanation: "Der Spiegel reports that attack drones struck an important industrial area about 1,000 kilometers east of Moscow. The demo includes Tagesschau as a supporting reference.",
        supporting: [ //add supporting sources here
          {
            title: "Tagesschau",
            url: "https://www.tagesschau.de/ausland/ukraine-russland-angriffe-210.html"
          }
        ],
        contradicting: []
      }
    ]
  },


  {
    id: "facebook",
    title: "Viral video of a US airport",
    url: "https://www.facebook.com/AVIO.KNOWLEDGE/videos/usa-airports-yesterday/1879317656567661/",
    claims: [
      {
        quote: "USA airports yesterday …",
        verdict: "falsch", // False
        explanation: "The demo cites Lead Stories, which identifies the viral clip as AI-generated. It depicts people sleeping in an airport and was circulated as footage from a US ground stop.",
        supporting: [],
        contradicting: [ //add contradicting sources here
          {
            title: "Lead Stories",
            url: "https://leadstories.com/hoax-alert/2026/11/fact-check-viral-clip-does-not-show-real-footage-of-american-airport-during-ground-stop.html"
          }
        ]
      }
    ]
  },
  {
    id: "sciencedirect",
    title: "Study comparing two COVID-19 vaccines",
    url: "https://www.sciencedirect.com/science/article/pii/S2590113326000556",
    claims: [
      {
        quote: "Florida adults who received the BNT162b2 COVID-19 vaccine in the initial series had higher risk of 12-month all-cause, cardiovascular, COVID-19, and non-COVID-19 mortality compared to matched mRNA-1273 recipients, with differences in cardiovascular and COVID-19 mortality primarily driven by adults 60 and older.",
        verdict: "unklar", // Unclear
        explanation: "The ScienceDirect article reports higher risks for some causes of death in its BNT162b2 group. The demo also lists ONS and NEJM references and leaves the comparison unresolved.",
        supporting: [ //add supporting sources here
          {
            title: "Office for National Statistics",
            url: "https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/deaths/bulletins/deathsinvolvingcovid19byvaccinationstatusengland/deathsoccurringbetween1januaryand31october2021"
          }
        ],
        contradicting: [ //add contradicting sources here
          {
            title: "The New England Journal of Medicine",
            url: "https://www.nejm.org/doi/full/10.1056/NEJMoa2115463"
          }
        ]
      }
    ]
  },

];
