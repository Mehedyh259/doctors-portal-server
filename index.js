const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);



const app = express();
const port = process.env.PORT || 5000;


// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@doctors-portal.lgpsw.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


const verifyToken = (req, res, next) => {
    const authHeader = req.headers?.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: "unauthorized accesss" });
    }
    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' })
        } else {
            req.decoded = decoded;
            next()
        }
    })
}

const emailSenderOptions = {
    auth: {
        api_user: process.env.EMAIL_SENDER_KEY
    }
}

const sendAppointmentEmail = (booking) => {
    const { patient, patientName, treatment, date, slot } = booking;

    const emailClient = nodemailer.createTransport(sgTransport(emailSenderOptions));
    const email = {
        from: process.env.EMAIL_SENDER,
        to: patient,
        subject: `Your Appointment for ${treatment} is on ${date} at ${slot} is confirmed`,
        text: `Your Appointment for ${treatment} is on ${date} at ${slot} is confirmed`,
        html: `<div>
            <p>Hello, ${patientName}, </p>
            <h2>Your Appointment for ${treatment} is confirmed </h2>
            <p>Looking forward to seeing you on ${date} at ${slot} </p>
            <h3>OUR ADDRESS</h3>
            <h4>Rajshahi, Bangladesh</h4>
        </div>
        `
    };

    emailClient.sendMail(email, (err, info) => {
        if (err) {
            console.log(err);
        } else {
            console.log('Message sent: ', info);
        }
    })
}
const sendPaymentConfirmationEmail = (booking) => {
    const { patient, patientName, treatment, date, slot } = booking;

    const emailClient = nodemailer.createTransport(sgTransport(emailSenderOptions));
    const email = {
        from: process.env.EMAIL_SENDER,
        to: patient,
        subject: `We have received you payment for ${treatment} is confirmed`,
        text: `Your payment for ${treatment} is on ${date} at ${slot} is confirmed`,
        html: `<div>
            <p>Hello, ${patientName}, </p>
            <h2>Your Payment for ${treatment} is confirmed </h2>
            <p>Looking forward to seeing you on ${date} at ${slot} </p>
            <h3>OUR ADDRESS</h3>
            <h4>Rajshahi, Bangladesh</h4>
        </div>
        `
    };

    emailClient.sendMail(email, (err, info) => {
        if (err) {
            console.log(err);
        } else {
            console.log('Message sent: ', info);
        }
    })
}



const run = async () => {
    try {
        await client.connect();
        console.log('Database Connected !!');
        const servicesCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        const userCollection = client.db('doctors_portal').collection('users');
        const doctorCollection = client.db('doctors_portal').collection('doctors');
        const paymentCollection = client.db('doctors_portal').collection('payments');

        // verify admin from database
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            const role = requesterAccount.role;
            if (role === 'admin') {
                next()
            } else {
                res.status(403).send({ message: 'forbidden access' })
            }
        }

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query);
            const services = await cursor.toArray();
            res.status(200).send(services);
        });

        app.get('/serviceName', async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query).project({ name: 1 });
            const services = await cursor.toArray();
            res.status(200).send(services);
        });

        app.get('/user', verifyToken, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.status(200).send(users)
        })


        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email })
            const isAdmin = user?.role === 'admin';
            res.send({ admin: isAdmin });
        })

        app.put('/user/admin/:email', verifyToken, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updatedDoc = {
                $set: { role: 'admin' }
            }
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send({ result });

        })
        app.put('/user/:email', async (req, res) => {
            const user = req.body
            const email = req.params.email;
            const filter = { email: email };
            const options = { upsert: true };

            const updatedDoc = {
                $set: user
            }
            const result = await userCollection.updateOne(filter, updatedDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_SECRET, { expiresIn: '1d' })

            res.send({ result, token });
        })


        app.get('/available', async (req, res) => {
            const date = req?.query?.date;
            // get all services
            const services = await servicesCollection.find().toArray();
            //  get the booking of that day
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            services.forEach((service) => {
                const serviceBookings = bookings.filter((book) => book.treatment === service.name);
                const bookedSlots = serviceBookings.map(book => book.slot);
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                service.slots = available;
            })
            res.send(services)
        });


        /**
         * API NAMING CONVENTION
         * app.get('/booking') //get all bookings in this collection or more than one
         * app.get('/booking/:id') //get a specifik booking
         * app.post('/booking/') // add new booking
         * app.patch('/booking/:id') //update
         */

        app.get('/booking', verifyToken, async (req, res) => {

            const decodedEmail = req.decoded.email;
            const patient = req.query?.patient;


            if (patient === decodedEmail) {
                const query = { patient: patient }
                const bookings = await bookingCollection.find(query).toArray();
                return res.status(200).send(bookings);
            } else {
                res.status(403).send({ message: 'forbidded access' });
            }
        })

        app.get('/booking/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await bookingCollection.findOne(query)
            res.send(booking);
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = {
                treatment: booking.treatment,
                date: booking.date,
                patient: booking.patient
            }

            const exist = await bookingCollection.findOne(query);

            if (exist) {
                return res.send({ success: false, booking: exist });
            }
            const result = await bookingCollection.insertOne(booking);

            sendAppointmentEmail(booking);

            return res.status(200).send({ success: true, result });
        });

        //update payment status
        app.patch('/booking/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const query = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const updatedBooking = await bookingCollection.updateOne(query, updatedDoc);
            const result = await paymentCollection.insertOne(payment);

            const booking = await bookingCollection.findOne({ _id: ObjectId(id) })
            console.log(booking);
            sendPaymentConfirmationEmail(booking)

            res.send(updatedBooking);

        })


        // doctors api

        app.get('/doctor', verifyToken, verifyAdmin, async (req, res) => {
            const doctors = await doctorCollection.find().toArray();
            res.send(doctors);
        });
        app.post('/doctor', verifyToken, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
        });
        app.delete('/doctor/:email', verifyToken, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email }
            const result = await doctorCollection.deleteOne(filter);
            res.send(result);
        });


        // PAYMENT RELATED API
        app.post('/create-payment-intent', verifyToken, async (req, res) => {
            const service = req.body;
            const price = service.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            })

            res.send({ clientSecret: paymentIntent.client_secret });
        })



    } finally {

    }
}
run().catch(console.dir);







app.get('/', (req, res) => {
    res.send("Doctors portal server");
});

app.listen(port, () => console.log('Server Running port: ', port));