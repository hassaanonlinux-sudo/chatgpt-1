const aiService = require('../services/ai.service');

const generateContentController = async (req, res) => {
    const { prompt, history = [] } = req.body ?? {};
    if (typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ error: 'A non-empty prompt is required.' });
    }
    if (
        !Array.isArray(history) ||
        history.length > 20 ||
        history.some(
            (message) =>
                !message ||
                !['user', 'assistant'].includes(message.role) ||
                typeof message.content !== 'string' ||
                !message.content.trim(),
        )
    ) {
        return res.status(400).json({ error: 'Conversation history is invalid.' });
    }

    try {
        const generatedContent = await aiService.generateContent(prompt, history);
        res.json({ generatedContent });
    } catch (error) {
        console.error('Error generating content:', error);
        res.status(500).json({ error: 'Failed to generate content' });
    }
};


module.exports = { generateContentController };