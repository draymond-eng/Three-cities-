/* =============================================================================
   TRIP DATA — the single source of truth for the whole app.

   This is the BASELINE / proposal (nothing is locked — the couples haven't
   met yet). Everything here is meant to be discussed, swapped, and voted on
   inside the app. Edit freely; the UI re-renders from this object.

   Dates: leave US Wed Apr 14, land Haneda Thu Apr 15, fly home Sun Apr 25.
   10 nights on the ground · Tokyo (4) → Hakone (1) → Kyoto (5). Group of 6.
   ========================================================================== */

const TRIP = {
  meta: {
    title: "Japan 2027",
    tagline: "Three Cities Social takes Japan",
    departUS: "2027-04-14",       // wheels up from the US (countdown target)
    landJapan: "2027-04-15",      // land Haneda, Thursday afternoon
    endDate: "2027-04-25",        // fly home Sunday
    nights: 10,
    homeTimezone: "America/Chicago", // most of the group flies from Chicago
    tripTimezone: "Asia/Tokyo",
    currency: { code: "JPY", symbol: "¥", perUSD: 164 }, // yen near weak end — in our favor
    goldenWeekWarning: "Golden Week starts Apr 29 — we're clear by 4 days. Hard wall: don't extend past the 25th.",
    estPerPerson: 4600,   // ~$3,190 ground + ~$1,400 economy flights
    estGroup: 27500,
    estNote: "Add 8–10% for 2027 pricing. Yen at 164/USD right now.",
    draft: true,          // baseline / open for discussion
  },

  /* ---- The crew: 6 travelers, 3 couples ----------------------------------- */
  travelers: [
    { id: "dj",       name: "DJ Jamiel",          pair: "DJ & Laura",     couple: true, color: "#e4573d", role: "Flights lead",   from: "", dietary: "", phone: "", funFact: "" },
    { id: "laura",    name: "Laura Stefanow",      pair: "DJ & Laura",     couple: true, color: "#e79fb0", role: "Reservations",   from: "", dietary: "", phone: "", funFact: "" },
    { id: "ali",      name: "Ali Washington",      pair: "The Washingtons", couple: true, color: "#2f6f9f", role: "Activities",     from: "", dietary: "", phone: "", funFact: "" },
    { id: "draymond", name: "Draymond Washington", pair: "The Washingtons", couple: true, color: "#1f9d8f", role: "Trip organizer", from: "", dietary: "", phone: "", funFact: "" },
    { id: "curtis",   name: "Curtis Maafoh",       pair: "The Maafohs",    couple: true, color: "#7a5cc0", role: "Budget keeper",   from: "", dietary: "", phone: "", funFact: "" },
    { id: "alexis",   name: "Alexis Maafoh",       pair: "The Maafohs",    couple: true, color: "#d98a3d", role: "Food & dining",   from: "", dietary: "", phone: "", funFact: "" },
  ],

  /* ---- Bases (the three places we sleep) ---------------------------------- */
  cities: [
    { id: "tokyo",  name: "Tokyo",  emoji: "🗼", nights: "Apr 15–19 · 4 nights", blurb: "Neon, shrines, and the best food city on earth.", lat: 35.6900, lng: 139.7040 },
    { id: "hakone", name: "Hakone", emoji: "♨️", nights: "Apr 19–20 · 1 night",  blurb: "Onsen in the mountains — the splurge night.",      lat: 35.2323, lng: 139.1069 },
    { id: "kyoto",  name: "Kyoto",  emoji: "⛩️", nights: "Apr 20–25 · 5 nights", blurb: "Old Japan — temples, torii, tea houses, geiko.",   lat: 35.0037, lng: 135.7760 },
  ],
  // Day trips out of a base (shown in the itinerary filter too)
  dayTrips: ["Kamakura", "Nara", "Osaka"],

  /* ---- Where we sleep (real proposals with prices) ------------------------ */
  stays: [
    {
      id: "stay-tokyo", city: "tokyo",
      name: "Onsen Ryokan Yuen Shinjuku",
      checkIn: "2027-04-15", checkOut: "2027-04-19",
      priceNote: "≈ $275 / night per couple", lat: 35.6949, lng: 139.7076,
      address: "Shinjuku, Tokyo", confirmation: "",
      rooms: [
        { name: "Double 1", who: ["dj", "laura"] },
        { name: "Double 2", who: ["ali", "draymond"] },
        { name: "Double 3", who: ["curtis", "alexis"] },
      ],
      notes: "Real hot spring on the 18th floor — indoor + outdoor over the skyline. Soaking every night after 14 hours of walking is the best amenity decision on the trip. ⚠️ Confirm shared-bath tattoo policy if anyone has visible tattoos.",
    },
    {
      id: "stay-hakone", city: "hakone",
      name: "Yama no Chaya",
      checkIn: "2027-04-19", checkOut: "2027-04-20",
      priceNote: "≈ $500 / person (incl. kaiseki dinner + breakfast)", lat: 35.2258, lng: 139.1044,
      address: "Tonosawa gorge, Hakone", confirmation: "",
      rooms: [
        { name: "Room 1", who: ["dj", "laura"] },
        { name: "Room 2", who: ["ali", "draymond"] },
        { name: "Room 3", who: ["curtis", "alexis"] },
      ],
      notes: "THE splurge. Riverside gorge setting, private open-air stone bath on each room's deck, kimono fitting on arrival. Book this FIRST. Private baths mean tattoos are a non-issue here.",
    },
    {
      id: "stay-kyoto", city: "kyoto",
      name: "The Gion House (both units)",
      checkIn: "2027-04-20", checkOut: "2027-04-25",
      priceNote: "≈ $180 / night per couple", lat: 35.0037, lng: 135.7760,
      address: "Quiet Gion side street, Kyoto", confirmation: "",
      rooms: [
        { name: "Bedroom pair A", who: ["dj", "laura"] },
        { name: "Bedroom pair B", who: ["ali", "draymond"] },
        { name: "Bedroom pair C", who: ["curtis", "alexis"] },
      ],
      notes: "Both units booked together: 4 bedrooms, 2 kitchens, a roof deck. Cheapest of the three and the one that keeps all six under one roof. Book this SECOND.",
    },
  ],

  /* ---- Flights / arrivals board ------------------------------------------- */
  flights: [
    { label: "Chicago group (4)", who: [], dir: "arrive", airport: "HND", date: "2027-04-15", time: "afternoon", flight: "", note: "4 travelers out of Chicago (ORD). Separate booking." },
    { label: "DC group (2)",      who: [], dir: "arrive", airport: "HND", date: "2027-04-15", time: "afternoon", flight: "", note: "2 travelers out of DC. Separate booking. Converge Thu afternoon." },
    { label: "Everyone home",     who: ["dj","laura","ali","draymond","curtis","alexis"], dir: "depart", airport: "HND", date: "2027-04-25", time: "", flight: "", note: "Fly home from Haneda (not Kansai — no nonstop from Osaka; going out through KIX = ~18h vs ~11.5h)." },
  ],
  flightsNote: "Round-trip Haneda for everyone. Who's in the Chicago 4 vs the DC 2? → assign in-app once bookings are set.",

  /* ---- The day-by-day baseline. type: travel|sight|food|activity|rest|meet - */
  days: [
    {
      date: "2027-04-15", city: "tokyo", title: "Land in Tokyo — soak & yakitori",
      summary: "Land Haneda in the afternoon, drop bags, first soak on the 18th floor, yakitori in Omoide Yokocho, bed. Don't plan anything.",
      meetup: "Yuen Shinjuku lobby once everyone's landed",
      items: [
        { time: "PM", type: "travel", title: "Land at Haneda (HND)", note: "Chicago 4 + DC 2 converge Thursday afternoon. Grab IC cards / pocket wifi at the airport.", lat: 35.5494, lng: 139.7798 },
        { time: "", type: "rest", title: "First onsen soak", note: "18th-floor hot spring over the skyline. This is why we picked this ryokan.", lat: 35.6949, lng: 139.7076 },
        { time: "20:00", type: "food", title: "Yakitori in Omoide Yokocho", note: "'Memory Lane' — tiny smoky grilled-skewer alley by Shinjuku Station. Perfect low-effort first night.", lat: 35.6938, lng: 139.6996 },
      ],
    },
    {
      date: "2027-04-16", city: "tokyo", title: "Old Tokyo",
      summary: "Senso-ji at dawn (jet lag has you up anyway), Kappabashi knives, Yanaka in the afternoon, Golden Gai at night.",
      meetup: "Kaminarimon (Senso-ji gate) — early, beat the crowds",
      items: [
        { time: "07:00", type: "sight", title: "Senso-ji at dawn", note: "Tokyo's oldest temple, empty and magic before the tour buses. Jet lag is your friend today.", lat: 35.7148, lng: 139.7967 },
        { time: "10:00", type: "activity", title: "Kappabashi 'Kitchen Town'", note: "Street of knife and kitchenware shops. Buy a real Japanese knife — they'll engrave it.", lat: 35.7141, lng: 139.7876 },
        { time: "14:00", type: "activity", title: "Yanaka", note: "Old-Tokyo neighborhood that survived the war — Yanaka Ginza shopping street, cats, temples, slow pace.", lat: 35.7276, lng: 139.7660 },
        { time: "20:00", type: "food", title: "Golden Gai", note: "Six alleys of tiny themed bars in Shinjuku. Some have cover charges; wander and pick one.", lat: 35.6938, lng: 139.7047 },
      ],
    },
    {
      date: "2027-04-17", city: "tokyo", title: "The modern city",
      summary: "teamLab in the morning, Meiji Jingu, the Harajuku→Omotesando walk, Shibuya Sky at sunset.",
      meetup: "teamLab entrance (see the Decisions tab: Planets vs Borderless)",
      items: [
        { time: "09:30", type: "activity", title: "teamLab (Planets or Borderless)", note: "Immersive digital-art museum. BOOK TIMED TICKETS. Which location? → vote in Decisions. Planets = water rooms (wear rollable pants).", lat: 35.6497, lng: 139.7906 },
        { time: "12:30", type: "sight", title: "Meiji Jingu", note: "Forest shrine in the middle of the city — calm reset after the sensory overload.", lat: 35.6764, lng: 139.6993 },
        { time: "14:30", type: "activity", title: "Harajuku → Omotesando walk", note: "Takeshita Street chaos into the tree-lined 'Champs-Élysées of Tokyo.'", lat: 35.6657, lng: 139.7126 },
        { time: "17:30", type: "sight", title: "Shibuya Sky at sunset", note: "Open-air rooftop over the famous crossing. BOOK the sunset slot early — it sells out.", lat: 35.6580, lng: 139.7016 },
      ],
    },
    {
      date: "2027-04-18", city: "tokyo", title: "Kamakura — split the day",
      summary: "The surfer paddles out at Kugenuma; the other five do the Great Buddha + Hokoku-ji bamboo. Regroup for lunch, then the Enoden coastal line to Enoshima.",
      meetup: "Regroup for lunch in Kamakura ~12:30",
      items: [
        { time: "AM", type: "activity", title: "TRACK A: Surf at Kugenuma", note: "For the surfer in the group — mellow beach break west of Kamakura. Board rentals on the beach.", lat: 35.3130, lng: 139.4780 },
        { time: "AM", type: "sight", title: "TRACK B: Great Buddha + Hokoku-ji", note: "The five non-surfers: the giant bronze Kotoku-in Buddha, then the serene Hokoku-ji bamboo grove + matcha.", lat: 35.3167, lng: 139.5361 },
        { time: "12:30", type: "food", title: "Regroup for lunch", note: "Meet back in central Kamakura — shirasu (whitebait) is the local specialty.", lat: 35.3190, lng: 139.5503 },
        { time: "15:00", type: "travel", title: "Enoden line to Enoshima", note: "Tiny vintage tram that hugs the coast (Slam Dunk crossing!). Sunset island shrine + views back to Fuji.", lat: 35.2996, lng: 139.4802 },
      ],
    },
    {
      date: "2027-04-19", city: "hakone", title: "Tsukiji → ship bags → into the mountains",
      summary: "Tsukiji breakfast, ship the big bags ahead to Kyoto, take the Romancecar into Hakone, and stop moving.",
      meetup: "Tsukiji Outer Market main gate — 8:30am",
      items: [
        { time: "08:30", type: "food", title: "Tsukiji breakfast", note: "Tamagoyaki, uni, tuna, strawberries. Go hungry. Then check out of Yuen Shinjuku.", lat: 35.6654, lng: 139.7707 },
        { time: "11:00", type: "travel", title: "Ship big bags → Kyoto (takkyubin)", note: "Send suitcases ahead to The Gion House so you travel light through Hakone. ~¥2,000/bag, arrives next day.", lat: 35.6900, lng: 139.7040 },
        { time: "13:00", type: "travel", title: "Odakyu Romancecar to Hakone", note: "Reserved scenic train from Shinjuku into the mountains. Grab the front seats if you can.", lat: 35.2323, lng: 139.1069 },
        { time: "15:00", type: "rest", title: "Yama no Chaya — arrive & stop moving", note: "Kimono fitting, private open-air stone bath on your deck, kaiseki dinner. This is the day you do nothing.", lat: 35.2258, lng: 139.1044 },
      ],
    },
    {
      date: "2027-04-20", city: "kyoto", title: "Lake Ashi → Shinkansen → Kyoto",
      summary: "Lake Ashi in the morning if it's clear, then the bullet train to Kyoto and dinner in Pontocho.",
      meetup: "Hotel lobby after breakfast — check the weather for Fuji",
      items: [
        { time: "09:00", type: "sight", title: "Lake Ashi (if clear)", note: "Pirate-ship cruise with Mt. Fuji reflections on a clear day. If it's socked in, sleep in instead — no forcing it.", lat: 35.2039, lng: 139.0257 },
        { time: "13:00", type: "travel", title: "Shinkansen to Kyoto", note: "Back down to Odawara, then the bullet train west (~2h to Kyoto). Reserve 6 seats together. Get an ekiben.", lat: 34.9858, lng: 135.7588 },
        { time: "16:00", type: "rest", title: "Settle into The Gion House", note: "Your shipped bags are waiting. Roof deck, two kitchens, all six under one roof.", lat: 35.0037, lng: 135.7760 },
        { time: "19:30", type: "food", title: "Dinner in Pontocho", note: "Lantern-lit dining alley along the river. Book a spot with a kawayuka riverside deck if it's warm.", lat: 35.0043, lng: 135.7708 },
      ],
    },
    {
      date: "2027-04-21", city: "kyoto", title: "Fushimi Inari at dawn + Miyako Odori",
      summary: "Fushimi Inari at 6:30am (at ten it's a conveyor belt; at six-thirty it's yours), Kiyomizu-dera, the Higashiyama stone lanes, and the Miyako Odori in the afternoon.",
      meetup: "Hotel lobby — 6:00am (worth it, promise)",
      items: [
        { time: "06:30", type: "sight", title: "Fushimi Inari — empty", note: "Thousands of red torii up the mountain. At 6:30 you have it to yourself; by 10 it's a conveyor belt. Real shoes.", lat: 34.9671, lng: 135.7727 },
        { time: "10:00", type: "sight", title: "Kiyomizu-dera", note: "Hillside temple with the big wooden stage over the valley.", lat: 34.9949, lng: 135.7850 },
        { time: "11:30", type: "activity", title: "Higashiyama stone lanes", note: "Walk down Sannenzaka/Ninenzaka — matcha, crafts, kimono. Beautiful preserved slopes.", lat: 34.9976, lng: 135.7808 },
        { time: "15:00", type: "activity", title: "Miyako Odori", note: "The geiko and maiko of Gion in full-scale dance productions — every April since 1872. Only happens while we're here. BOOK TICKETS.", lat: 35.0031, lng: 135.7752 },
      ],
    },
    {
      date: "2027-04-22", city: "kyoto", title: "Arashiyama + craft workshop + cook at home",
      summary: "Arashiyama at 7am for the bamboo grove, Tenryu-ji, a craft workshop in the afternoon, and cooking together at the house that night.",
      meetup: "Hotel lobby — 6:30am for the empty bamboo grove",
      items: [
        { time: "07:00", type: "sight", title: "Arashiyama Bamboo Grove — empty", note: "Transcendent at 7am, a mob by 10. Same rule as Fushimi Inari: go early or don't bother.", lat: 35.0170, lng: 135.6716 },
        { time: "08:30", type: "sight", title: "Tenryu-ji", note: "Zen temple + borrowed-scenery garden right by the grove.", lat: 35.0159, lng: 135.6738 },
        { time: "14:00", type: "activity", title: "Craft workshop", note: "Hands-on afternoon — pottery, indigo dyeing, knife-making, or woodwork. → pick one in Decisions.", lat: 35.0116, lng: 135.7681 },
        { time: "19:00", type: "food", title: "Cook at The Gion House", note: "Two kitchens, a market run, and a night in. The couples' night-in of the trip.", lat: 35.0037, lng: 135.7760 },
      ],
    },
    {
      date: "2027-04-23", city: "kyoto", title: "Nara by day, Osaka by night",
      summary: "Todai-ji, the deer, Kasuga Taisha — then straight over to Osaka for Dotonbori at night, back to Kyoto around eleven.",
      meetup: "Kyoto Station, JR Nara Line — 8:30am",
      items: [
        { time: "09:15", type: "sight", title: "Todai-ji & the deer", note: "One of the world's largest wooden buildings + a giant bronze Buddha. Buy 'shika senbei' — the deer bow for them.", lat: 34.6889, lng: 135.8398 },
        { time: "11:30", type: "sight", title: "Kasuga Taisha", note: "Lantern-lined shrine in the forest — thousands of bronze and stone lanterns.", lat: 34.6811, lng: 135.8483 },
        { time: "18:00", type: "food", title: "Dotonbori, Osaka", note: "Takoyaki, okonomiyaki, kushikatsu, the Glico sign. The one big Osaka night. → see Decisions: is the late night worth it?", lat: 34.6687, lng: 135.5013 },
        { time: "23:00", type: "travel", title: "Back to Kyoto (~11pm)", note: "~15–30 min on the train. Late but worth it.", lat: 35.0037, lng: 135.7760 },
      ],
    },
    {
      date: "2027-04-24", city: "kyoto", title: "Slow last day + the big kaiseki",
      summary: "A slow last day with a private guide, Nijo Castle, the Philosopher's Path, then the one big kaiseki dinner — Kikunoi or Hyotei.",
      meetup: "Hotel lobby — relaxed morning start with the guide",
      items: [
        { time: "10:00", type: "sight", title: "Nijo Castle (private guide)", note: "Shogun's castle with 'nightingale floors' that chirp to foil intruders. A guide makes it sing.", lat: 35.0142, lng: 135.7481 },
        { time: "13:30", type: "activity", title: "Philosopher's Path", note: "Canal-side walk under the trees between temples — the slow, reflective last-day stroll.", lat: 35.0270, lng: 135.7947 },
        { time: "19:00", type: "food", title: "The big kaiseki dinner", note: "The one splurge meal — Kikunoi or Hyotei (300+ yrs old). → vote in Decisions. Book WEEKS ahead.", lat: 34.9987, lng: 135.7807 },
      ],
    },
    {
      date: "2027-04-25", city: "kyoto", title: "Home — 7:30 Nozomi to Haneda",
      summary: "The 7:30 Nozomi to Tokyo, then Haneda, then home. ⚠️ If the Haneda departure is before noon, the morning train doesn't work — we'd need a final Tokyo night.",
      meetup: "Kyoto Station — in time for the 7:30 Nozomi",
      items: [
        { time: "07:30", type: "travel", title: "Nozomi Kyoto → Tokyo", note: "~2h15 back to Tokyo, then transfer to Haneda. Confirm the flight time first (see Decisions).", lat: 34.9858, lng: 135.7588 },
        { time: "", type: "travel", title: "Haneda → home", note: "Round-trip out of Haneda. Be at the airport 3 hours early for international.", lat: 35.5494, lng: 139.7798 },
      ],
    },
  ],

  /* ---- DECISIONS: open questions the group votes on ----------------------- */
  /* status: open|leaning|decided. Votes are stored per-device (see note in UI). */
  decisions: [
    {
      id: "d-hakone", title: "Yama no Chaya — worth the $500/person?", status: "leaning",
      note: "The Hakone splurge: private open-air bath, kimono, kaiseki. The 'room is the experience' night.",
      options: [
        { id: "in", label: "In — it's the trip highlight", note: "Book it first, as planned." },
        { id: "trim", label: "Find something cheaper", note: "Keep a Hakone night but at a lower price point." },
        { id: "skip", label: "Skip Hakone, extra Kyoto night", note: "Go straight Tokyo → Kyoto." },
      ],
    },
    {
      id: "d-teamlab", title: "teamLab: Planets or Borderless?", status: "open",
      note: "Both are incredible. Planets = barefoot, water rooms (Toyosu). Borderless = maze of rooms (Azabudai).",
      options: [
        { id: "planets", label: "Planets", note: "Water + light, wear rollable pants." },
        { id: "borderless", label: "Borderless", note: "Wander-and-get-lost rooms." },
      ],
    },
    {
      id: "d-osaka", title: "Friday: is the Osaka late night worth it?", status: "open",
      note: "Nara by day then Dotonbori by night = back to Kyoto ~11pm. Big fun, long day.",
      options: [
        { id: "yes", label: "Yes — Dotonbori is a must", note: "Do the full day." },
        { id: "no", label: "Skip Osaka, easy Kyoto night", note: "Nara only, dinner back in Kyoto." },
      ],
    },
    {
      id: "d-craft", title: "Kyoto craft workshop — which one?", status: "open",
      note: "Hands-on Thursday afternoon before we cook at the house.",
      options: [
        { id: "pottery", label: "Pottery", note: "Throw a bowl to take home." },
        { id: "indigo", label: "Indigo dyeing (aizome)", note: "Dye a scarf/tenugui." },
        { id: "knife", label: "Knife making", note: "Sharpen/finish your own blade." },
        { id: "wood", label: "Woodwork", note: "Chopsticks / small joinery." },
      ],
    },
    {
      id: "d-kaiseki", title: "The big kaiseki dinner — Kikunoi or Hyotei?", status: "open",
      note: "The one splurge meal of the trip. Both are legendary and 300+ years old. Book weeks ahead.",
      options: [
        { id: "kikunoi", label: "Kikunoi", note: "3 Michelin stars, Higashiyama." },
        { id: "hyotei", label: "Hyotei", note: "400+ years, near Nanzenji." },
      ],
    },
    {
      id: "d-return", title: "Apr 25 return: is the Haneda flight before noon?", status: "open",
      note: "Still open. If the flight is before noon, the 7:30 Nozomi from Kyoto doesn't work and we'd need a final Tokyo night on the 24th.",
      options: [
        { id: "afternoon", label: "Afternoon flight — plan holds", note: "Morning Nozomi works." },
        { id: "morning", label: "Morning flight — add a Tokyo night", note: "Move to Tokyo on the 24th." },
      ],
    },
  ],

  /* ---- IDEAS board: add-ons the group can thumbs-up ----------------------- */
  ideas: [
    { id: "i1", title: "Karaoke night (all 6)", city: "any",   note: "Non-negotiable at least once." },
    { id: "i2", title: "Sumo — morning practice or a match", city: "tokyo", note: "Depends on the tournament calendar." },
    { id: "i3", title: "Go-kart street tour (Mario-style)",  city: "tokyo", note: "Needs an International Driving Permit." },
    { id: "i4", title: "Tea ceremony in Kyoto", city: "kyoto", note: "Slow, beautiful, very Kyoto." },
    { id: "i5", title: "Yukata / kimono for a day in Higashiyama", city: "kyoto", note: "Great photos in the stone lanes." },
    { id: "i6", title: "Himeji Castle detour", city: "kyoto", note: "Japan's most stunning original castle — day trip." },
    { id: "i7", title: "Baseball game (NPB)", city: "any", note: "Japanese baseball crowds are unreal." },
    { id: "i8", title: "Nakameguro river walk", city: "tokyo", note: "Trendy canal-side cafes even post-blossom." },
  ],

  /* ---- Booking order (from the plan) -------------------------------------- */
  bookingOrder: [
    { id: "bk1", label: "Yama no Chaya (Hakone)", note: "Books out first — lock it now." },
    { id: "bk2", label: "The Gion House (Kyoto)", note: "Both units, together." },
    { id: "bk3", label: "Flights — Haneda round-trip", note: "4 from Chicago, 2 from DC." },
    { id: "bk4", label: "Yuen Shinjuku (Tokyo)", note: "3 double rooms." },
    { id: "bk5", label: "Shinkansen tickets", note: "Exactly 30 days before each leg — they don't open earlier." },
    { id: "bk6", label: "Miyako Odori + Shibuya Sky + teamLab", note: "Timed-entry things that sell out." },
  ],

  /* ---- Packing list (late April = 55–72°F, dry, layers) ------------------- */
  packing: [
    { cat: "Documents", items: ["Passport (6+ mo validity)", "Flight confirmations", "Hotel confirmations", "Travel insurance", "Copy of passport", "IDP (if go-karting)"] },
    { cat: "Money & Phone", items: ["Some yen cash", "2+ credit cards (Visa/MC)", "eSIM or pocket wifi", "Charger + power bank", "US plugs fit (Japan is 100V Type A)"] },
    { cat: "Clothes (April layers)", items: ["Light jacket / packable shell", "A sweater or two", "Broken-in walking shoes", "Slip-on shoes (temples = shoes off)", "One nicer outfit (kaiseki dinner)", "Socks without holes"] },
    { cat: "For the ryokans", items: ["Swimsuit is NOT needed (onsen = bare)", "Small toiletry kit", "Hair tie (long hair up in the bath)", "Tattoo cover patches (if needed for Yuen shared bath)"] },
    { cat: "Daypack", items: ["Foldable daypack", "Reusable water bottle", "Portable charger", "Hand towel (restrooms rarely have one)", "Small trash bag (bins are rare)", "Coin purse"] },
    { cat: "Health", items: ["Prescriptions (check Japan restrictions)", "Motion-sickness meds (boats/buses)", "Blister plasters", "Deodorant (bring your own)"] },
  ],

  /* ---- Phrasebook --------------------------------------------------------- */
  phrases: [
    { en: "Hello", jp: "こんにちは", romaji: "Konnichiwa" },
    { en: "Thank you", jp: "ありがとうございます", romaji: "Arigatō gozaimasu" },
    { en: "Excuse me / Sorry", jp: "すみません", romaji: "Sumimasen" },
    { en: "Please", jp: "お願いします", romaji: "Onegai shimasu" },
    { en: "Do you speak English?", jp: "英語を話せますか？", romaji: "Eigo o hanasemasu ka?" },
    { en: "How much is it?", jp: "いくらですか？", romaji: "Ikura desu ka?" },
    { en: "Where is the bathroom?", jp: "トイレはどこですか？", romaji: "Toire wa doko desu ka?" },
    { en: "Delicious!", jp: "おいしい！", romaji: "Oishii!" },
    { en: "Cheers!", jp: "乾杯！", romaji: "Kanpai!" },
    { en: "Check, please", jp: "お会計お願いします", romaji: "Okaikei onegai shimasu" },
    { en: "I have an allergy", jp: "アレルギーがあります", romaji: "Arerugī ga arimasu" },
    { en: "Table for six", jp: "六人です", romaji: "Roku-nin desu" },
    { en: "The station", jp: "駅", romaji: "Eki" },
    { en: "Water, please", jp: "お水をください", romaji: "Omizu o kudasai" },
  ],

  /* ---- Japan Guide cards (the FAQ, answered once) ------------------------- */
  guide: [
    { icon: "💳", title: "IC cards (Suica / Pasmo)", body: "Tap-to-ride cards for trains, buses, and konbini. Get a 'Welcome Suica' at Haneda or add Suica to Apple Wallet and top up with a card. One card works nationwide." },
    { icon: "🚄", title: "Shinkansen & the JR Pass math", body: "Skip the JR Pass this trip — our legs total ~$190/person and the pass is $305. Book Shinkansen seats exactly 30 days before each leg (they don't open earlier) and reserve all 6 seats together." },
    { icon: "📦", title: "Ship your bags (takkyubin)", body: "Send big suitcases ahead — hotel-to-hotel, ~¥2,000/bag, arrives next day. We do this Tokyo→Kyoto so we travel light through Hakone. Life-changing." },
    { icon: "📶", title: "Internet: eSIM vs pocket wifi", body: "eSIM (Airalo/Ubigi) is easiest per phone. A pocket wifi router is great for a group — one device covers everyone. Book airport or hotel pickup." },
    { icon: "💴", title: "Cash & cards", body: "More cashless than it used to be, but carry cash — small restaurants, shrines, and markets are cash-only. 7-Eleven ATMs reliably take foreign cards. Yen ~164/USD right now, in our favor." },
    { icon: "♨️", title: "Onsen rules", body: "Wash & rinse fully at the seated showers BEFORE the bath. No swimsuits — you go in bare. Small towel out of the water, hair up. Yama no Chaya has private baths (tattoos fine); confirm Yuen Shinjuku's shared-bath tattoo policy." },
    { icon: "🙇", title: "Etiquette quick hits", body: "No tipping (it can offend). Quiet on trains, no calls. Shoes off at a genkan/step. Don't eat while walking. Carry your trash. Escalators: stand left in Tokyo." },
    { icon: "🏪", title: "Konbini are your friend", body: "7-Eleven, Lawson, FamilyMart: cheap great food, ATMs, tickets, umbrellas. Egg-salad sandos and fried chicken are elite. Open 24/7." },
    { icon: "🌸", title: "Late April weather", body: "Past peak bloom, which is the point: 55–72°F, dry, thinner crowds, ~half the hotel rates — plus wisteria and shibazakura season instead of cherry blossoms." },
    { icon: "🚨", title: "Emergency numbers", body: "Police: 110. Fire/Ambulance: 119. Very safe country. Save each hotel's address in Japanese to show taxi drivers. US Embassy Tokyo for anything serious." },
  ],
};

// Expose globally for the plain-script setup.
window.TRIP = TRIP;
