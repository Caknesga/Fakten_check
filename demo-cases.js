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
            title: "Name of the contradicting source",
            url: "PASTE_THE_SOURCE_URL_HERE"
          }     
        ]
      }
    ]
  }
];