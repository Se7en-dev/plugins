export default ({ fileType, fileSystem }) => {

    //Merge function generously "borrowed" by Joel ant 05
    function deepMerge(obj1, obj2) {
        let outArray = undefined
        if (Array.isArray(obj1) && Array.isArray(obj2)) outArray = obj1.concat(obj2)
        else if (Array.isArray(obj1)) outArray = obj1.concat([obj2])
        else if (Array.isArray(obj2)) outArray = obj2.concat([obj1])
        else if (typeof obj2 !== 'object') return obj2

        // Remove duplicates
        if (outArray) return [...new Set([...outArray])]

        let res = {}

        for (const key in obj1) {
            if (obj2[key] === undefined) res[key] = obj1[key]
            else res[key] = deepMerge(obj1[key], obj2[key])
        }

        for (const key in obj2) {
            if (obj1[key] === undefined) res[key] = obj2[key]
        }

        return res
    }

    function isTemplateable(filePath)
    {
        let type = fileType?.getId(filePath);
        switch(type) {
            case  "block" :
            case  "entity" :
            case  "item" :
            case  "particle" :
            case  "clientEntity" :
            case  "clientItem" :  
                return true;
            default:
                return false; 
        }
    }

    function getIdentifier(filePath, fileContent)
    {
        let type = fileType?.getId(filePath);

        switch(type) {
            case  "block" :
                return fileContent?.['minecraft:block']?.description?.identifier;
            case  "entity" :
                return fileContent?.['minecraft:entity']?.description?.identifier
            case  "item" :
            case  "clientItem" :  
                return fileContent?.['minecraft:item']?.description?.identifier
            case  "particle":
                return fileContent?.['particle_effect']?.description?.identifier
            case  "clientEntity" :
                return fileContent?.['minecraft:client_entity']?.description?.identifier
            default:
            }
    }

    function noErrors(fileContent)
    {
        return !fileContent?.__error__;
    }

    function isTemplate(filePath, fileContent)
    {
        return fileContent?.is_template && getIdentifier(filePath, fileContent);
    }

    function getInclude(fileContent)
    {
        let inc = fileContent?.include;
        if(inc)
        {
            if(!Array.isArray(inc))
                return [inc];
            return inc;
        }
    }

    function getVariables(filePath, fileContent)
    {
        let ident = getIdentifier(filePath, fileContent);
        let [namespace, name] = ident.split(":");
        let vars = fileContent?.variables;
        return { ...vars, "IDENTIFIER" : ident, "NAME" : name, "NAMESPACE" : namespace};
    }

    function addTemplate(filePath, identifier, fileContent)
    {
        let id = fileType?.getId(filePath);
        let e = templates[id] ?? {};
        e[identifier] = fileContent;
        templates[id] = e;
    }

    function mergeTemplate(filePath, entityJSON, templateEntity)
    {
        let id = fileType?.getId(filePath);
        let templateGroup = templates[id];
        let template = templateGroup?.[templateEntity];

        //Just to tag non-templates as non-templates, gets removed later
        if(!isTemplate(filePath, entityJSON))
            entityJSON.is_template = false;

        if(template)
            return deepMerge(template, entityJSON);
        else 
            return entityJSON;
    }

    function replaceVariables(filePath, fileContent)
    {
        if(!isTemplate(filePath, fileContent))
        {
            let cString = JSON.stringify(fileContent);
            let vars = getVariables(filePath, fileContent);
            for(let v in vars)
            {
                let strn = JSON.stringify(vars[v]);
                cString = cString.replaceAll("\"${"+ v +"}\"", strn);
                cString = cString.replaceAll("${"+ v +"}", typeof vars[v] === 'object' ? strn.replaceAll("\"", "\\\"") : (vars[v] + ""));
            }
            fileContent = JSON.parse(cString);
        }
        return fileContent;
    }


    function cleanup(fileContent)
    {
        delete fileContent?.include;
        delete fileContent?.is_template;
        delete fileContent?.variables;
        return fileContent;
    }

    var templates = {};

    return {

        //Make sure template files do not get output in the build
        async transformPath(filePath) {
            if (isTemplateable(filePath)) {
                try {
                    let obj = await fileSystem.readJson(filePath);

                    if(isTemplate(filePath, obj))
                    return null;
                }catch(e){}
            }
        },
        
        //Same as EntityAliases plugin, do this just in case users don't have it installed
        registerAliases(filePath, fileContent) {
            let type = fileType?.getId(filePath);
            if (
                noErrors(fileContent) &&
                isTemplateable(filePath) &&
                getIdentifier(filePath, fileContent)
                )
                return [
                    `${getIdentifier(filePath, fileContent)}_${type}`
                ]
            },
            
            //Make entities that use templates depend on those templates
        require(filePath, fileContent) {
                if (isTemplateable(filePath) && noErrors(fileContent)) {

                let type = fileType?.getId(filePath);
                let includes = getInclude(fileContent);

                if (includes) {
                    return Array.from(includes, i => `${i}_${type}`);
                }
            }
        },

        //Actually merge templates with entity files
        async transform(filePath, fileContent) {
            if (isTemplateable(filePath) && noErrors(fileContent)) {

                let tobj = fileContent;
                let identifier = getIdentifier(filePath, tobj);
                let isTemplateObj = isTemplate(filePath, tobj);
                let includes = getInclude(tobj);

                if (includes) {
                    for(let i in includes)
                        tobj = await mergeTemplate(filePath, tobj, includes[i]);
                }

                tobj = replaceVariables(filePath, tobj);

                if(isTemplateObj)
                    addTemplate(filePath, identifier, tobj);
                else
                    tobj = cleanup(tobj);

                return tobj;
            }
        },

    }
}