import icongen from 'icon-gen';

const options = {
  type: 'ico',
  modes: ['ico'],
  names: {
    ico: 'icon'
  },
  report: true
};

icongen('./build/icon.svg', './build', options)
  .then((results) => {
    console.log('Icon generated successfully:', results);
  })
  .catch((err) => {
    console.error('Error generating icon:', err);
    process.exit(1);
  });
