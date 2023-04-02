const mongoose = require('mongoose')

const userSchema = mongoose.Schema({
    name:{
        required:[true, "Name is required"],
        type: String
    },
    isSuperAdmin:{
        type:Boolean,
        default: false
    },
    image:{
        type:String,
        default:null
    },
    email:{
        type:String,
        unique: true,
        required:[true,'Email address is required'],
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
    },
    passwordHash:{
        required: true,
        type:String
    }
}, {timestamps: true})

const User = mongoose.model('User',userSchema)


module.exports = User
