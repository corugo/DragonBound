var express = require('express'),
    router = express.Router(),
    nodemailer = require('nodemailer');

// metodo de server - GET
// Muestra algo
// ruta account/password/resetPass
router.get('/accounts/password/reset/', function (req, res) {
    // renderizar una plantilla html
    res.render('recuperarContrasena');
});
// metodo de server - POST
// Recibo algo y hace algo
// ruta account/password/resetPass
router.post('/accounts/password/reset/', async function (req, res) {
	const correoDelUzuario = req.body.email;
	await enviarCorreo(correoDelUzuario);
	// enviar un texto en pantalla
	res.render('password_done2')
});

const enviarCorreo = (email)=>{
	return new Promise((resolve,reject)=>{
	 let transporter = nodemailer.createTransport({
	    service: 'gmail',
            auth: {
                user: 'holamundo@gmail.com',
                pass: 'hollamundo'
            }
	 });
	var mailOptions = {
	   from: 'holamundito@gmail.com',
            to: email,
            subject: 'Password reset on dragonbound.net',
            text: '[PT] Enviamos um e-mail com as instruções de redefinição da sua senha para o endereço que você informou. O e-mail pode levar algumas horas para chegar, por favor aguarde e verifique seu e-mail mais tarde.'
	};
	let resp=false;

	transporter.sendMail(mailOptions, function(error, info){
	    if (error) {
	        console.log("error is "+error);
	       resolve(false); // or use rejcet(false) but then you will have to handle errors
	    } 
	   else {
	       console.log('Email sent: ' + info.response);
	       resolve(true);
	    }
	   });
	 })  
}

module.exports = router;