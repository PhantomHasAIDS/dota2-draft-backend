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

const MONGO_URI = "mongodb+srv://PhantomHasAIDS:Tomi2002seppojuhani!@dota2counterpicking.o7lyfu7.mongodb.net/?retryWrites=true&w=majority&appName=Dota2Counterpicking";

const generateMatchups = async () => {
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
            allMatchups[hero.HeroId] = data;
        } catch (err) {
            console.error(`Dailed to fetch data for ${hero.name}:`, err);
        }
    }
}