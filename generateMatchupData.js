require("dotenv").config();

const fs = require("fs");
const fetchMatchups = require("./fetchMatchups");
const mongoose = require("mongoose");


const HeroSchema = new mongoose.Schema({
  HeroId: { type: Number, required: true },
  name: { type: String, required: true },
  roles: [{ type: String }],
  icon_url: { type: String },
});

const Hero = mongoose.model("Hero", HeroSchema);

const MONGO_URI = process.env.MONGO_URI;

const generateMatchups = async () => {
    try {
        await mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        const heroes = await Hero.find({});
        const allMatchups = {};

        for (const hero of heroes) {
            console.log(`Fetching matchups for ${hero.name} (ID: ${hero.HeroId})`);
            try {
                const data = await fetchMatchups(hero.HeroId);
                if (data) {
                    allMatchups[hero.HeroId] = data;
                } else {
                    console.warn(`No data for ${hero.name}`);
                }
                await new Promise(res => setTimeout(res, 150)); // rate limit prevention
            } catch (err) {
                console.error(`Dailed to fetch data for ${hero.name}:`, err);
            }
        }

        fs.writeFileSync("matchupData.json", JSON.stringify(allMatchups, null, 2));
        console.log("Matchup data saved to matchupData.json");

        process.exit(0);
    } catch (err) {
        console.error("Error generating matchup data:", err);
        process.exit(1);
    }
};

generateMatchups();