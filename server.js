require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const matchupData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "matchupData.json"), "utf-8")
);

const MONGO_URI = process.env.MONGO_URI;

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

app.post("/api/select-hero", async (req, res) => {
  const { heroId, team, allyHeroIds = [], enemyHeroIds = [] } = req.body;

  if (!heroId || !["ally", "enemy"].includes(team)){
    return res.status(400).json({ error: "heroId and team ('ally' or 'enemy')are  required" });
  }

  const selectionList = team === "ally" ? allyHeroIds : enemyHeroIds;
  const opposingList = team === "ally" ? enemyHeroIds : allyHeroIds;

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
    return res.json({ message: "Hero already selected" });
  }

  try {
    let matchups = matchupData[heroId]
    if (!matchups){
      console.warn(`No local data for heroId ${heroId}`);
      return res.status(404).json({ error: "Matchup data not found" });
    }

    res.json({ message: "Hero selected",
      matchups,
    });
  } catch (err) {
    console.error("Failed to fetch/store matchups:", err);
    res.status(500).json({ error: "Internal Server Error" })
  }
});

app.post("/api/synergy-picks", async (req, res) => {
  const { allyHeroIds = [], enemyHeroIds = [], bannedHeroIds = [], roleFilter = null, fullDraft = false } = req.body;
  try {
    const allHeroes = await Hero.find({});
    const pickedSet = new Set([...allyHeroIds, ...enemyHeroIds, ...bannedHeroIds]);

    if (fullDraft && allyHeroIds.length === 5 && enemyHeroIds.length === 5) {
      const teamStats = { ally: [], enemy: [] };

      for (const teamName of ["ally", "enemy"]) {
        const teamIds = teamName === "ally" ? allyHeroIds : enemyHeroIds;
        const matchupType = "with";
        const opponentIds = teamName === "ally" ? enemyHeroIds : allyHeroIds;
        const counterType = "vs";

        for (const heroId of teamIds) {
          const data = matchupData[heroId];
          if (!data) continue;

          // Internal synergy
          const synergy = data[matchupType]
            .filter(( {heroId2 }) => teamIds.includes(heroId2))
            .reduce((sum, { synergy }) => sum + synergy, 0);

          // External counter
          const counter = data[counterType]
            .filter(({ heroId2 }) => opponentIds.includes(heroId2))
            .reduce((sum, { synergy }) => sum + synergy, 0);

          const hero = allHeroes.find(h => h.HeroId === heroId);

          teamStats[teamName].push({
            HeroId: hero.HeroId,
            name: hero.name,
            icon_url: hero.icon_url,
            synergyScore: synergy.toFixed(2),
            counterScore: counter.toFixed(2),
            totalScore: (synergy - counter).toFixed(2),
          });
        }
      }
      return res.json({ mode: "fullDraft", teams: teamStats });
    }

    const synergyScores = {};
    const counterScores = {};

    // Synergy calculations
    for (const hero of allHeroes) {
      const id = hero.HeroId;
      if (pickedSet.has(id)) continue;

      const matchups = matchupData[id]?.with || [];
      for (const { heroId2, synergy } of matchups) {
        if (allyHeroIds.includes(heroId2)) {
          synergyScores[id] = (synergyScores[id] || 0) + synergy;
        }
      }
    }

    // Counter calculations
    for (const enemyId of enemyHeroIds) {
      const enemyMatchups = matchupData[enemyId]?.vs || [];
      for (const { heroId2, synergy } of enemyMatchups) {
        if (!pickedSet.has(heroId2)) {
          counterScores[heroId2] = (counterScores[heroId2] || 0) - synergy;
        }
      }
    }

    // Turn into an array and sort
    const combinedScores = {};
    for (const hero of allHeroes) {
      const id = hero.HeroId;
      const isPickedOrBanned = pickedSet.has(id);
      const roleMismatch = roleFilter && !hero.roles.includes(roleFilter);
      if(isPickedOrBanned || roleMismatch) continue;

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
  console.log(`🚀 Server is now running!`);
});
