const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || '233054564282-9bkk084dbqombdtinrbpdn9utmd1636k.apps.googleusercontent.com',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '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',
    callbackURL: 'http://localhost:5000/api/auth/google/callback',
    passReqToCallback: true
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      console.log('🔍 Google profile received:', {
        id: profile.id,
        email: profile.emails?.[0]?.value,
        name: profile.displayName
      });
      
      // Check if user already exists
      let user = await User.findOne({
        $or: [
          { googleId: profile.id },
          { email: profile.emails?.[0]?.value }
        ]
      });
      
      if (!user) {
        // Create new user
        user = await User.create({
          googleId: profile.id,
          name: profile.displayName,
          email: profile.emails?.[0]?.value,
          avatar: profile.photos?.[0]?.value,
          emailVerified: true,
          role: 'user',
          hasStore: false
        });
        console.log('✅ New user created via Google OAuth');
      } else {
        // Update existing user with Google info
        user.googleId = profile.id;
        user.avatar = profile.photos?.[0]?.value;
        user.emailVerified = true;
        await user.save();
        console.log('✅ Existing user updated with Google info');
      }
      
      return done(null, user);
    } catch (error) {
      console.error('Passport Google Strategy error:', error);
      return done(error, null);
    }
  }
));

// Serialize user
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;