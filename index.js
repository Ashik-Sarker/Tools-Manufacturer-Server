const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken');
const app = express()
const port = process.env.PORT || 5000
require('dotenv').config();
const { MongoClient, ServerApiVersion, MongoCursorInUseError, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// middleware
app.use(cors())
app.use(express.json())

// CONNECTION TO MONGODB
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zgoow.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({message:'Unauthorized access'})
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({message:'Forbidden access'})
        }
        req.decoded = decoded;
        next();
    })
}


async function run() {
    try {
        await client.connect();
        const toolsCollection = client.db('best_tools_manufacturer').collection('tools');
        const purchaseCollection = client.db('best_tools_manufacturer').collection('purchase');
        const usersCollection = client.db('best_tools_manufacturer').collection('users');
        const reviewCollection = client.db('best_tools_manufacturer').collection('customer_review');
        const paymentsCollection = client.db('best_tools_manufacturer').collection('payments');

        // verify admin
        const verifyAdmin = async(req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await usersCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next()
            }
            else{
                return res.status(403).send({ message: 'Forbidden access' });
            }
        }

        // Add Tools
        app.post('/addTool', async (req, res) => {
            const tool = req.body;
            const result = await toolsCollection.insertOne(tool);
            res.send(result);
        })

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

        // Delete specific tool item
        app.delete('/tool/:id',verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await toolsCollection.deleteOne(query);
            res.send(result);
        })

        // Add purchase information
        app.post('/purchase', async (req, res) => {
            const purchase = req.body;
            const query = { toolsId: purchase.toolsId, email:purchase.email }
            const search = await purchaseCollection.findOne(query);
            if (search) {
                return res.send({acknowledged:false})
            }
            const result = await purchaseCollection.insertOne(purchase);
            res.send(result);
        })

        // get all purchase info
        app.get('/allOrders', async (req, res) => {
            const orders = await purchaseCollection.find({}).toArray();
            res.send(orders)
        })

        // get purchase info for specific user
        app.get('/myOrders', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email === decodedEmail) {
                const query = { email: email };
                const items = await purchaseCollection.find(query).toArray();
                return res.send(items) 
            }
            else {
                return res.status(403).send({message:'forbidden access'})
            }
        })

        //delete specific item from purchase collection
        app.delete('/myOrder/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await purchaseCollection.deleteOne(query);
            res.send(result);
        })
        
        //get specific item from purchase collection
        app.get('/myOrder/:id',verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await purchaseCollection.findOne(query);
            res.send(result);
        })

        // Update myOrders as paid
        app.patch('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updateDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId,
                }
            }
            const result = await paymentsCollection.insertOne(payment);
            const updatedOrder = await purchaseCollection.updateOne(filter, updateDoc);

            res.send(updatedOrder);
        })

        // Update myOrders as shift now
        app.patch('/shiftNow/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const shiftingInfo = req.body;
            const filter = { _id: ObjectId(id) };
            const updateDoc = {
                $set: {
                    shiftNow:true
                }
            }
            const result = await paymentsCollection.insertOne(shiftingInfo);
            const updatedOrder = await purchaseCollection.updateOne(filter, updateDoc);

            res.send(updatedOrder);
        })

        // Add users
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = { $set: user };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            // console.log(process.env.ACCESS_TOKEN_SECRET);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '5h' });
            // console.log(token);
            res.send({result,token});
        })

        // get all users
        app.get('/users',verifyJWT, async (req, res) => {
            const users = await usersCollection.find({}).toArray();
            res.send(users);
        })

        // Update users as an admin

        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = { $set: {role:'admin'} };
            const result = await usersCollection.updateOne(filter, updateDoc);
            return res.send(result)
        })

        // Verify admin
        app.get('/admin/:email',verifyJWT, async(req, res) =>{
            const email = req.params.email;
            const user = await usersCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin });
        })

        // Customer review
        app.get('/reviews', async (req, res) => {
            const reviews = await reviewCollection.find({}).toArray();
            res.send(reviews)
        })

        // Add a review
        app.post('/review', async (req, res) => {
            const review = req.body;
            const result = await reviewCollection.insertOne(review);
            res.send(result);
        })

        // get specific user
        app.get('/user/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            res.send(user);
        })

        // Update myProfile
        app.put('/myProfile/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = { $set: user };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        })

        //payment
      app.post("/create-payment-intent",verifyJWT, async(req, res) => {
        const service = req.body;
        const subtotal = service.subTotal;
        const amount = subtotal * 100;
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types:['card']
        });
        res.send({clientSecret:paymentIntent.client_secret})
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