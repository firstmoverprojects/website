// Original Bidwick catalog. No real brands, makers, or collectibles.
(function (root) {
  "use strict";

  var CONDITIONS = [
    { id: "poor", title: "Poor", num: 1, den: 2, clue: "Poor shape. Halve the mark." },
    { id: "fair", title: "Fair", num: 4, den: 5, clue: "Fair shape. Take off a fifth." },
    { id: "good", title: "Good", num: 1, den: 1, clue: "Good shape. Keep the mark." },
    { id: "fine", title: "Fine", num: 5, den: 4, clue: "Fine shape. Add a quarter." }
  ];

  var ERAS = [
    { id: "early", title: "Early years", num: 4, den: 5, clue: "Early years. Take off a fifth." },
    { id: "middle", title: "Middle years", num: 1, den: 1, clue: "Middle years. Leave the era flat." },
    { id: "late", title: "Late years", num: 6, den: 5, clue: "Late years. Add a fifth." }
  ];

  function maker(name, base) {
    return {
      name: name,
      base: base,
      clue: name + ". Yard notes put this mark near " + base + " coins before wear."
    };
  }

  function family(id, name, workshop, marks, itemNames) {
    return {
      id: id,
      name: name,
      workshop: workshop,
      makers: marks.map(function (row) { return maker(workshop + " " + row[0], row[1]); }),
      items: itemNames.slice()
    };
  }

  var FAMILIES = [
    family("lantern", "Wick lamps", "Wickmere", [["single notch", 20], ["twin notch", 45], ["brass ring", 80]], ["Chimney lamp", "Hand lantern", "Wall sconce", "Night lamp", "Barn lantern", "Signal lamp"]),
    family("clock", "Bramble clocks", "Pindle & Brack", [["dot hands", 25], ["leaf hands", 55], ["gilt hands", 90]], ["Mantel clock", "Shelf clock", "Wall clock", "Travel clock", "Kitchen clock", "Case clock"]),
    family("crock", "River crocks", "Saltmead", [["blue dash", 15], ["wave band", 40], ["cobalt deer", 70]], ["Butter crock", "Water crock", "Pickle jar", "Bean pot", "Cream pot", "Storage jar"]),
    family("tool", "Bench tools", "Harl & Auger", [["single punch", 20], ["twin punch", 45], ["star punch", 75]], ["Brace drill", "Drawknife", "Smoothing plane", "Marking gauge", "Hand saw", "Mallet"]),
    family("folio", "Band folios", "Lowwhistle Press", [["one-bar stamp", 15], ["three-bar stamp", 35], ["ribbon stamp", 60]], ["March folio", "Reel folio", "Lullaby folio", "Dance folio", "Dawn folio", "Harbor folio"]),
    family("chart", "Coast charts", "Merrin Chart Room", [["short compass", 25], ["full compass", 55], ["gold compass", 95]], ["Inlet chart", "Reef chart", "Harbor chart", "Island chart", "Ferry chart", "Fog chart"]),
    family("tin", "Tin windups", "Hobble & Pin", [["bird peck", 20], ["bird hop", 50], ["gilt bird", 85]], ["Wind bird", "Wind boat", "Wind carriage", "Wind drummer", "Wind fish", "Wind mill"]),
    family("bottle", "Apothecary glass", "Pell & Bottle", [["plain lip", 15], ["ribbed lip", 35], ["cut lip", 65]], ["Tincture bottle", "Dropper bottle", "Salt jar", "Green vial", "Round flask", "Labelled jar"]),
    family("quilt", "Patch quilts", "Nine-barn stitch", [["running stitch", 20], ["cross stitch", 45], ["feather stitch", 80]], ["Barn quilt", "River quilt", "Star quilt", "Path quilt", "Night quilt", "Garden quilt"]),
    family("book", "Village books", "Otterbind Press", [["otter one", 15], ["otter two", 40], ["gilt otter", 70]], ["Field notes", "Recipe book", "Poem book", "Tide book", "Bird book", "Workshop book"]),
    family("camera", "Box cameras", "Lumen & Odd", [["one lens ring", 30], ["two lens rings", 60], ["brass lens", 100]], ["Box camera", "Folding camera", "Street camera", "Pocket camera", "Studio camera", "Travel camera"]),
    family("radio", "Cabinet radios", "Hearthwave", [["cloth grill", 25], ["wood grill", 55], ["inlay grill", 90]], ["Kitchen radio", "Parlor radio", "Shelf radio", "Bedside radio", "Shop radio", "Porch radio"]),
    family("copper", "Copper pans", "Kettleford", [["one rivet row", 20], ["two rivet rows", 45], ["braided handle", 75]], ["Sauce pan", "Stew pot", "Fry pan", "Kettle", "Jelly mold", "Ladle set"]),
    family("lure", "River lures", "Minnow & Reed", [["tin scale", 15], ["paint scale", 35], ["glass eye", 60]], ["Spoon lure", "Plug lure", "Fly card", "Willow creel", "Rod wrap", "Float set"]),
    family("stone", "Stone animals", "Quarry cousins", [["chisel nick", 25], ["smooth nick", 55], ["polished nick", 90]], ["Stone hare", "Stone owl", "Stone fish", "Stone fox", "Stone wren", "Stone toad"]),
    family("typer", "Desk writers", "Keybarn", [["round keys", 30], ["square keys", 60], ["ivory keys", 95]], ["Desk writer", "Travel writer", "Shop writer", "Ledger writer", "Card writer", "Quiet writer"]),
    family("optic", "Field glasses", "Farlens", [["one ring", 25], ["two rings", 55], ["etched ring", 100]], ["Pocket glass", "Field glass", "Gallery glass", "Roof glass", "Marine glass", "Desk glass"]),
    family("music", "Music boxes", "Bellrow", [["four teeth", 20], ["eight teeth", 50], ["sixteen teeth", 85]], ["Cylinder box", "Crank box", "Drawer box", "Bird box", "Waltz box", "Lullaby box"]),
    family("meadow", "Meadow gear", "Long Meadow club", [["plain brand", 15], ["stripe brand", 35], ["crest brand", 70]], ["Wooden bat", "Snow shoe", "Leather ball", "Skipping rope", "Quoit set", "Net paddle"]),
    family("measure", "Brass measures", "Small Weights", [["gram tick", 20], ["dual tick", 50], ["inspector tick", 85]], ["Balance scale", "Weight set", "Caliper", "Flask stand", "Meter stick", "Hand lens"])
  ];

  function countItems() {
    var n = 0;
    for (var i = 0; i < FAMILIES.length; i++) n += FAMILIES[i].items.length;
    return n;
  }

  function familyById(id) {
    for (var i = 0; i < FAMILIES.length; i++) if (FAMILIES[i].id === id) return FAMILIES[i];
    return FAMILIES[0];
  }

  function itemValue(base, cond, era) {
    var raw = base * cond.num * era.num;
    var den = cond.den * era.den;
    var value = Math.round(raw / den);
    if (!Number.isFinite(value) || value < 1) return 1;
    return value;
  }

  // Wide bands without the book, half as wide with it. Ceiling covers the catalog.
  function makeBands(book) {
    var width = book ? 15 : 30;
    var bands = [];
    var lo = 1;
    while (lo <= 150) {
      var hi = Math.min(150, lo + width - 1);
      bands.push({ lo: lo, hi: hi, label: lo + "\u2013" + hi });
      lo = hi + 1;
    }
    return bands;
  }

  function bandIndex(value, bands) {
    var n = Math.round(Number(value));
    if (!Number.isFinite(n)) n = 1;
    for (var i = 0; i < bands.length; i++) {
      if (n <= bands[i].hi) return i;
    }
    return bands.length - 1;
  }

  function salePrice(trueValue, distance) {
    var factor = distance === 0 ? 100 : distance === 1 ? 78 : distance === 2 ? 55 : 35;
    var price = Math.round(Number(trueValue) * factor / 100);
    if (!Number.isFinite(price) || price < 1) return 1;
    return price;
  }

  root.BidwickItems = {
    CONDITIONS: CONDITIONS,
    ERAS: ERAS,
    FAMILIES: FAMILIES,
    countItems: countItems,
    familyById: familyById,
    itemValue: itemValue,
    makeBands: makeBands,
    bandIndex: bandIndex,
    salePrice: salePrice
  };
})(typeof window !== "undefined" ? window : globalThis);
