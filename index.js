const express = require('express')
const cors = require('cors')
const app = express()
const port = process.env.PORT || 5000
const { MongoClient, ServerApiVersion, MongoCursorInUseError, ObjectId } = require('mongodb');

require('dotenv').config();
// middleware
app.use(cors())
app.use(express.json())

// CONNECTION TO MONGODB
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zgoow.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        const toolsCollection = client.db('best_tools_manufacturer').collection('tools');
        const purchaseCollection = client.db('best_tools_manufacturer').collection('purchase');

        // get all tools item
        app.get('/tools', async (req, res) => {
            const cursor = toolsCollection.find({});
            const items = await cursor.toArray();
            res.send(items);
        })

        //get specific tool information
        app.get('/tool/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const tool = await toolsCollection.findOne(query);
            res.send(tool);
        })

        // Add purchase information
        app.post('/purchase', async (req, res) => {
            const purchase = req.body;
            const result = await purchaseCollection.insertOne(purchase);
            res.send(result);
        })
        
    }
    finally{}
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`App listening on port ${port}`)
})