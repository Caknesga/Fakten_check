const DEMO_CASES = [
  {
    url: "https://www.spiegel.de/wirtschaft/ukraine-schiesst-grosses-russisches-industriegebiet-in-brand-a-6fbf0df7-642d-47c8-a121-4f68d281d873",
    claims: [
      {
        quote: "Angriffsdrohnen haben ein wichtiges russisches Industriegebiet 1000 Kilometer östlich von Moskau getroffen.",
        verdict: "wahr",   //change this to "falsch" if the claim is false, change to "unklar" if the claim is unverified
        explanation: " Laut dem Artikel des Spiegel haben Angriffsdrohnen ein wichtiges russisches Industriegebiet getroffen, das etwa 1000 Kilometer östlich von Moskau liegt.",
        supporting: [ //add supporting sources here
          {
            title: "Tagesschau", 
            url: "https://www.tagesschau.de/ausland/ukraine-russland-angriffe-210.html"
          }
        ],
        contradicting: [ //add contradicting sources here
          {
            title: "keine bekannten Quellen",
            url: "PASTE_THE_SOURCE_URL_HERE"
          }     
        ]
      }
    ]
  },


  {
    url: "https://www.facebook.com/AVIO.KNOWLEDGE/videos/usa-airports-yesterday/1879317656567661/",
    claims: [
      {
        quote: "USA airports yesterday …",
        verdict: "falsch",   //change this to "falsch" if the claim is false, change to "unklar" if the claim is unverified
        explanation: " Viral Video von leute zeigt nicht die tatsächlichen Aufnahmen eines amerikanischen Flughafens während eines Ground Stops. Das Video ist mit KI generiert.",
        supporting: [ //add supporting sources here
          {
            title: "Keine bekannten Quellen", 
            url: ""
          }
        ],
        contradicting: [ //add contradicting sources here
          {
            title: "leadstories.com",
            url: "https://leadstories.com/hoax-alert/2026/11/fact-check-viral-clip-does-not-show-real-footage-of-american-airport-during-ground-stop.html"
          }     
        ]
      }
    ]
  },
{
    url: "https://www.sciencedirect.com/science/article/pii/S2590113326000556",
    claims: [
      {
        quote: "Florida adults who received the BNT162b2 COVID-19 vaccine in the initial series had higher risk of 12-month all-cause, cardiovascular, COVID-19, and non-COVID-19 mortality compared to matched mRNA-1273 recipients, with differences in cardiovascular and COVID-19 mortality primarily driven by adults 60 and older.",
        verdict: "unklar",   //change this to "falsch" if the claim is false, change to "unklar" if the claim is unverified
        explanation: "Es gibt widersprüchliche Studienergebnisse zu den Risiken von BNT162b2 im Vergleich zu mRNA-1273. Die Studie in ScienceDirect zeigt ein höheres Risiko für bestimmte Todesursachen bei BNT162b2-Empfängern, während andere Quellen wie die ONS-Statistik und NEJM-Studien unterschiedliche Ergebnisse liefern.",
        supporting: [ //add supporting sources here
          {
            title: "ons.gov.uk", 
            url: "https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/deaths/bulletins/deathsinvolvingcovid19byvaccinationstatusengland/deathsoccurringbetween1januaryand31october2021"
          }
        ],
        contradicting: [ //add contradicting sources here
          {
            title: "nejm.org",
            url: "https://www.nejm.org/doi/full/10.1056/NEJMoa2115463"
          }     
        ]
      }
    ]
  },

];