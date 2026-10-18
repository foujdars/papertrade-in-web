exports.setChartColor=async(page,scope,label,color)=>{
 await scope.getByRole('button',{name:label,exact:true}).click();
 const palette=page.getByRole('dialog',{name:`${label} palette`,exact:true});
 await palette.getByRole('textbox',{name:'Hex colour',exact:true}).fill(color);
 await palette.getByRole('button',{name:'Use colour',exact:true}).click();
};
exports.chartColorValue=async(scope,label)=>(await scope.getByRole('button',{name:label,exact:true}).getAttribute('title')).split(': ').at(-1);
