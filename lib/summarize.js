'use strict';

var N = 100; // The top N wanted important words to score against
// Threshold for how many words away from currently evaluated word to not count
var CLUSTER_THRESHOLD = 5;


var STOP_WORDS = require('./fixtures/stop-words');
var _ = require('lodash');
var math = require('mathjs');
var nlp = require('nlp_compromise');
var natural = require('natural');
var tokenizer = new natural.TreebankWordTokenizer();

module.exports = function summarize(text) {
  var nlpText = nlp.text(text);

  var sentences = _.map(nlpText.sentences, function(s) {
    return s.str;
  });

  var normalizedSentences = _.map(sentences, function(s) {
    return _.toLower(s);
  });

  var tokenizedSentences = _.map(sentences, function(s) {
    return tokenizer.tokenize(s);
  });

  var words = _.chain(tokenizedSentences)
    .flatten()
    .map(function(word) {
      return _.toLower(word);
    })
    .value();

  var stoppedWords = _.filter(words, function(word) {
    return !(STOP_WORDS.indexOf(word) > -1);
  });

  stoppedWords = _.map(stoppedWords, function(word) {
    return word.replace(/\.$/i, '');
  });

  var fDist = _.reduce(stoppedWords, function(list, word) {
    if (!list[word]) {
      list[word] = {
        word: word,
        count: 1,
      };
      return list;
    }
    list[word].count++;
    return list;
  }, {});

  fDist = _.orderBy(fDist, 'count', 'desc');

  var topNWords = _.take(fDist, N);

  var scores = scoreSentences(normalizedSentences, topNWords);

  var avg = _.meanBy(scores, function(score) {
    return score.score;
  });
  var std = math.std(_(scores)
    .filter()
    .map('score').value());

  // Return anything within half a standard deviation above the mean
  // the score basically means, the higher the % of important words, the better,
  // but if two clusters has the same % of important words, the longer one is
  // better
  var meanScored = _.filter(scores, function(s) {
    return s.score > avg + 0.5 * std;
  });

  var summary = _.map(meanScored, function(score) {
    return sentences[score.index];
  });

  return summary.join('\n');
};

function scoreSentences(sentences, importantWords) {
  var scores = _(sentences)
    .map(function(s) {
      return tokenizer.tokenize(s);
    })
    .map(function(s, i) {
      var wordIndex = [];
      // go through each tokenized sentence, see which important words are in
      // there, return -1 is fine, can filter later
      _.forEach(importantWords, function(w, i) {
        wordIndex.push(s.indexOf(w.word));
      });

      // remove -1's, mutates array
      _.remove(wordIndex, function(i) {
        return i < 0;
      });

      // For sentences that don't have any important words, just ignore
      if (wordIndex.length < 1) {
        return false;
      }

      wordIndex = _.sortBy(wordIndex);

      // Using the word index, compute clusters by using a max distance
      // threshold for any two consecutive words.
      var clusters = [];
      var cluster = [wordIndex[0]];

      for (var x = 1; x < wordIndex.length; x++) {
        // CLUSTER_THRESHOLD is set to 5, this means that the word index of the
        // sentence is the position of the word in that sentence, so we check
        // the distance of words in the sentence and if they're less then 5 away
        // (i.e. [1,3,9]), then first iteration will give 3 - 1 = 2, so we add
        // to cluster, so cluster = [1, 3],
        if (wordIndex[x] - wordIndex[x - 1] < CLUSTER_THRESHOLD) {
          cluster.push(wordIndex[x]);
        } else {
          // then in second iteration, we have 9-3 = 6, which is greater than 5
          // so we append current cluster array to clusters, so we get
          // clusters=[[1,3]]
          clusters.push(cluster);
          // then we add the current word to cluster, so we start new,
          // so cluster=[9]
          cluster = [wordIndex[x]];
        }
      }
      clusters.push(cluster);

      // the result is you never have a cluster where each word is more than
      // 5 away from the word before
      // i.e. [[1,3],[9,10,13], [18,20,21,22,24,25]]
      // Score each cluster. The max score for any given cluster is the score
      // for the sentence.

      var maxClusterScore = 0;
      var score;

      _.each(clusters, function(cluster) {
        // get a count of how large cluster is
        var nSigWords = cluster.length;
        // since each cluster is a cluster of indexes and sorted, we can take
        // the last element and subtract the first to get the number of words
        // in cluster
        // so [1,3]=3-1+1=3, and [9,10,13]=13-9+1=5
        // i think what's happening here is we're trying to get clusters of
        // parts of the sentences, including non-important words, and each
        // cluster starts and stops with an important word
        // but clusters are also split by having too many non-important words
        // between them
        var totalClusterWords = cluster[cluster.length - 1] - cluster[0] +
          1;
        score = 1.0 * nSigWords * nSigWords / totalClusterWords;
        if (score > maxClusterScore) {
          maxClusterScore = score;
        }
        // for each sentence, we find the highest score in all the clusters
      });

      var result = {
        score: maxClusterScore,
        index: i,
      };
      return result;

    }).value();

  return scores;
}
