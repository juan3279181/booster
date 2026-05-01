const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Supabase Connection
const supabaseUrl = 'https://bcebjhocpsrgdthbqfsd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjZWJqaG9jcHNyZ2R0aGJxZnNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NTgxODQsImV4cCI6MjA5MzIzNDE4NH0.0GMpdSndxEOEng6NaxnlSAAtBZ2UskRwx-G8G545LO8';
const supabase = createClient(supabaseUrl, supabaseKey);

const defaultVideos = [
    { id: "iA-PtzMqIxM", title: "Premium Short 1", targetViews: 999999, currentViews: 0, ownerId: "admin" },
    { id: "Q2vy01-r3Dk", title: "Premium Short 2", targetViews: 999999, currentViews: 0, ownerId: "admin" },
    { id: "gLjSUCCbo2I", title: "Premium Short 3", targetViews: 999999, currentViews: 0, ownerId: "admin" },
    { id: "uSq0PnWTnD0", title: "Premium Short 4", targetViews: 999999, currentViews: 0, ownerId: "admin" }
];

app.post('/api/user/init', async (req, res) => {
    const { userId } = req.body;
    let { data: user, error } = await supabase.from('users').select('*').eq('user_id', userId).single();

    if (!user) {
        const { data: newUser, error: insError } = await supabase.from('users').insert([
            {
                user_id: userId,
                coins: 100,
                referral_code: 'BOOST' + userId.substring(0, 5).toUpperCase()
            }
        ]).select().single();
        user = newUser;
    }
    res.json(user || { error: 'Failed to init user' });
});

app.post('/api/coins/add', async (req, res) => {
    const { userId, amount } = req.body;
    const { data: user } = await supabase.from('users').select('coins').eq('user_id', userId).single();
    const newTotal = (user?.coins || 0) + amount;
    await supabase.from('users').update({ coins: newTotal }).eq('user_id', userId);
    res.json({ coins: newTotal });
});

app.get('/api/campaigns', async (req, res) => {
    const { data: activeCampaigns } = await supabase.from('campaigns').select('*').eq('is_completed', false);

    // Convert DB fields (target_views) back to JSON fields (targetViews) for the Android App
    const mapped = (activeCampaigns || []).map(c => ({
        id: c.id,
        link: c.link,
        targetViews: c.target_views,
        currentViews: c.current_views,
        ownerId: c.owner_id,
        isCompleted: c.is_completed
    }));

    res.json([...defaultVideos, ...mapped]);
});

app.post('/api/campaigns/add', async (req, res) => {
    const { userId, link, targetViews, id } = req.body;
    const cost = targetViews * 10;

    const { data: user } = await supabase.from('users').select('coins').eq('user_id', userId).single();

    if (user && user.coins >= cost) {
        await supabase.from('users').update({ coins: user.coins - cost }).eq('user_id', userId);
        const { data: campaign } = await supabase.from('campaigns').insert([
            { id, link, target_views: targetViews, owner_id: userId }
        ]).select().single();
        res.json(campaign);
    } else res.status(400).send('Insufficient coins');
});

app.post('/api/campaigns/watch', async (req, res) => {
    const { videoId, userId } = req.body;
    const reward = 10; // Earn 10 coins for watching community videos

    // Update user coins
    const { data: user } = await supabase.from('users').select('coins').eq('user_id', userId).single();
    const newTotal = (user?.coins || 0) + reward;
    await supabase.from('users').update({ coins: newTotal }).eq('user_id', userId);

    // Update campaign views
    if (!defaultVideos.find(v => v.id === videoId)) {
        const { data: camp } = await supabase.from('campaigns').select('current_views, target_views').eq('id', videoId).single();
        if (camp) {
            const nextViews = camp.current_views + 1;
            await supabase.from('campaigns').update({
                current_views: nextViews,
                is_completed: nextViews >= camp.target_views
            }).eq('id', videoId);
        }
    }

    res.json({ success: true, coins: newTotal, reward });
});

app.post('/api/referral/claim', async (req, res) => {
    const { userId, code } = req.body;
    const { data: user } = await supabase.from('users').select('*').eq('user_id', userId).single();

    if (user && !user.has_claimed_referral) {
        if (code.startsWith('BOOST') && code !== user.referral_code) {
            await supabase.from('users').update({
                coins: user.coins + 250,
                has_claimed_referral: true
            }).eq('user_id', userId);
            res.json({ success: true, coins: user.coins + 250 });
        } else res.status(400).send('Invalid code');
    } else res.status(400).send('Already claimed or error');
});

app.listen(port, '0.0.0.0', () => console.log(`Server running on port ${port}`));
