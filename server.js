const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const fetchMatchups = require("./fetchMatchups")

const app = express();
app.use(cors());
app.use(express.json());

// Replace this with your real MongoDB connection string
const MONGO_URI = "mongodb+srv://PhantomHasAIDS:Tomi2002seppojuhani!@dota2counterpicking.o7lyfu7.mongodb.net/?retryWrites=true&w=majority&appName=Dota2Counterpicking";

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ Connected to MongoDB"))
.catch((err) => console.error("❌ MongoDB connection error:", err));

// Hero schema
const HeroSchema = new mongoose.Schema({
  HeroId: {type: Number, required: true },
  name: { type: String, required: true },
  roles: [{ type: String }],
  icon_url: { type: String },
});

const Hero = mongoose.model("Hero", HeroSchema);

// Routes
app.get("/heroes", async (req, res) => {
  try {
    const heroes = await Hero.find({});
    res.json(heroes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch heroes" });
  }
});

app.get("/heroes/:id", async (req, res) => {
  const hero = await Hero.findOne({ id: req.params.id });
  if (!hero) return res.status(404).send("Hero not found");
  res.json(hero);
});

app.post("/heroes", async (req, res) => {
  const hero = new Hero(req.body);
  await hero.save();
  res.status(201).send(hero);
});

app.post("/recommend", async (req, res) => {
  const { allies = [], enemies = [] } = req.body;

  try {
    const allHeroes = await Hero.find({});
    const picked = new Set([...allies, ...enemies]);

    function getMapValue(map, key) {
      if (!map) return 0;
      if (typeof map.get === "function") {
        return map.get(key) || 0;
      }
      return map[key] || 0;
    }

    const scoredHeroes = allHeroes
      .filter(hero => !picked.has(hero.name))
      .map(hero => {
        const synergyScore = allies.reduce((acc, ally) => acc + getMapValue(hero.synergies, ally), 0);
        const counterScore = enemies.reduce((acc, enemy) => acc + getMapValue(hero.counters, enemy), 0);

        return {
          name: hero.name,
          roles: hero.roles,
          icon_url: hero.icon_url,
          synergyScore,
          counterScore,
          totalScore: synergyScore + counterScore
        };
      });

    scoredHeroes.sort((a, b) => b.totalScore - a.totalScore);

    res.json(scoredHeroes);
  } catch (error) {
    console.error("Error in /recommend:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/matchups", async (req, res) => {
  const { heroId } = req.body;

  if (!heroId) {
    return res.status(400).json({ error: "HeroId is required"})
  }

  try {
    const data = await fetchMatchups(heroId);
    res.json(data);
  } catch (err) {
    console.error("Failed to fetch matchups:", err);
    res.status(500).json({ error: "Failed to fetch matchups" })
  }
});

const currentSelections = {
  allyHeroIds: [],
  enemyHeroIds: [],
  bannedHeroIds: [],
  matchups: {}
};

app.post("/api/select-hero", async (req, res) => {
  const { heroId, team } = req.body;

  if (!heroId || !["ally", "enemy"].includes(team)){
    return res.status(400).json({ error: "heroId and team ('ally' or 'enemy')are  required" });
  }

  const selectionList = team === "ally" ? currentSelections.allyHeroIds : currentSelections.enemyHeroIds;
  const opposingList = team === "ally" ? currentSelections.enemyHeroIds : currentSelections.allyHeroIds;

  // Prevent picking a hero that's already picked by the other team
  if (opposingList.includes(heroId)) {
    return res.status(400).json({ error: "Hero already picked by the opposing team." });
  }

  // Enforce 5 hero limit
  if (selectionList.length >= 5) {
    return res.status(400).json({ error: `Maximum of 5 ${team} heroes can be selected.`});
  }

  // Prevent duplicate selection
  if (selectionList.includes(heroId)) {
    return res.json({ message: "Hero already selected", currentSelections });
  }

  try {
    const data = await fetchMatchups(heroId);
    selectionList.push(heroId);
    currentSelections.matchups[heroId] = data;
    res.json({ message: "Hero selected", currentSelections });
  } catch (err) {
    console.error("Failed to fetch/store matchups:", err);
    res.status(500).json({ error: "Internal Server Error" })
  }
});

app.post("/api/deselect-hero", async (req, res) => {
  const { heroId, team } = req.body;
  if (!heroId || (team !== "ally" && team !== "enemy")) {
    return res.status(400).json({ error: "heroId and valid team are required" });
  }

  const teamArray = team === "ally" ? currentSelections.allyHeroIds : currentSelections.enemyHeroIds;

  const index = teamArray.indexOf(heroId);
  if (index === -1) {
    return res.status(400).json({ error: "Hero not in selected team" });
  }

  // Remove hero from the team
  teamArray.splice(index, 1);

  // Remove matchups related to removed hero
  const stillUsed = currentSelections.allyHeroIds.includes(heroId) || currentSelections.enemyHeroIds.includes(heroId);
  if (!stillUsed) {
    delete currentSelections.matchups[heroId];
  }

  res.json({ message: "Hero deselected", currentSelections });
});

app.post("/api/clear", (req, res) => {
  try {
    currentSelections.allyHeroIds = [];
    currentSelections.enemyHeroIds = [];
    currentSelections.bannedHeroIds = [];
    currentSelections.matchups = {};
    res.json({ message: "All selections cleared", currentSelections });
  } catch (err) {
    console.error("Failed to clear selections:", err);
    res.status(500).json({ error: "Failed to clear selections" });
  }
});

app.post("/api/ban-hero", async (req, res) => {
  const { heroId } = req.body;
  if (!currentSelections.bannedHeroIds) currentSelections.bannedHeroIds = [];
  if (currentSelections.bannedHeroIds.includes(heroId)) {
    return res.status(400).json({ message: "Hero already banned" })
  }
  
  try {
    const data = await fetchMatchups(heroId);
    currentSelections.bannedHeroIds.push(heroId);
    currentSelections.matchups[heroId] = data;
    res.json({ message: "Hero Banned" })
  } catch (err) {
    console.error("Failed to fetch/store matchups for banned hero:", err);
    res.status(500).json({ error: "Failed to ban hero" });
  }
});

app.post("/api/unban-hero", (req, res) => {
  const { heroId } = req.body;
  const index = currentSelections.bannedHeroIds.indexOf(heroId);
  if (index !== -1) {
    currentSelections.bannedHeroIds.splice(index, 1);
    delete currentSelections.matchups[heroId];
    return res.json({ message: "Hero unbanned" });
  }
  return res.status(400).json({ message: "Hero not found in bans" });
});

app.get("/api/synergy-picks", async (req, res) => {
  try {
    const allHeroes = await Hero.find({});
    const pickedSet = new Set([...currentSelections.allyHeroIds, ...currentSelections.enemyHeroIds, ...currentSelections.bannedHeroIds,]);

    const synergyScores = {};
    const counterScores = {};

    // Synergy calculations
    for (const allyId of currentSelections.allyHeroIds) {
      const matchups = currentSelections.matchups[allyId]?.with || [];
      for (const { heroId2, synergy } of matchups) {
        synergyScores[heroId2] = (synergyScores[heroId2] || 0) + synergy;
      }
    }

    // Counter calculations
    for (const enemyId of currentSelections.enemyHeroIds) {
      const matchups = currentSelections.matchups[enemyId]?.vs || [];
      for (const { heroId2, synergy } of matchups) {
        counterScores[heroId2] = (counterScores[heroId2] || 0) + synergy;
      }
    }

    // Turn into an array and sort
    const combinedScores = {};
    for (const hero of allHeroes) {
      const id = hero.HeroId.toString();
      const isPicked = pickedSet.has(hero.HeroId);
      const isBanned = currentSelections.bannedHeroIds?.includes(hero.HeroId);
      if(isPicked || isBanned) continue;

      const synergy = synergyScores[id] || 0;
      const counter = counterScores[id] || 0;
      const total = synergy - counter;

      combinedScores[id] = {
        HeroId: hero.HeroId,
        name: hero.name,
        icon_url: hero.icon_url,
        synergyScore: synergy.toFixed(2),
        counterScore: counter.toFixed(2),
        totalScore: total.toFixed(2),
      };
    }

    const top10 = Object.values(combinedScores)
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 10);

    res.json(top10);
  } catch (err) {
    console.error("Error in /api/synergy-picks:", err);
    res.status(500).json({ error: "Failed to compute synergy picks" });
  }
});

// Start server
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
